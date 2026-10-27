import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseEnv } from 'node:util';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { OPENAI_MODEL } from '../server/coach.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const account = 'issue8876@gmail.com';
const project = 'maeum-835b3';
const site = 'https://maeum.web.app';
export class SetupError extends Error {}
const readOptional = async file => { try { return await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } };

// Preserve unrelated secrets/comments and replace all duplicates of changed keys.
export function updateEnvText(text, values) {
  const pending = new Map(Object.entries(values));
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => {
    const name = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1];
    return !name || !pending.has(name);
  });
  while (lines.at(-1) === '') lines.pop();
  for (const [name, value] of pending) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || /[\r\n]/.test(value)) throw new SetupError('설정 형식을 확인해 주세요.');
    lines.push(`${name}=${value}`);
  }
  return lines.join('\n') + '\n';
}
async function saveEnv(file, original, values) {
  const temp = `${file}.setup-tmp`;
  await writeFile(temp, updateEnvText(original, values), { mode: 0o600 });
  await rename(temp, file);
}

export function runPrivate(commandArgs, { input, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || ''), FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' };
    delete childEnv.OPENAI_API_KEY; delete childEnv.GEMINI_API_KEY;
    const child = spawn(process.execPath, commandArgs, { cwd, env: childEnv, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => reject(new SetupError('실행 도구를 시작하지 못했습니다. 이 화면을 닫고 다시 실행해 주세요.')));
    child.stdin.on('error', () => {});
    child.once('close', code => code === 0 ? resolve() : reject(new SetupError('서버 등록 또는 배포가 끝나지 않았습니다. 키는 화면에 표시하지 않습니다. Codex에 이 상태를 알려 주세요.')));
    child.stdin.end(input || '');
  });
}

export async function registerKey(key, { workspace = root, fetchImpl = fetch, run = runPrivate, progress = () => {} } = {}) {
  if (typeof key !== 'string' || !/^sk-(?!admin-)[A-Za-z0-9_-]{20,}$/.test(key.trim())) throw new SetupError('OpenAI 프로젝트 API 키를 붙여 넣어 주세요. 관리자 키는 사용하지 않습니다.');
  key = key.trim();
  const envPath = path.join(workspace, '.env');
  const text = await readOptional(envPath);
  const env = parseEnv(text);
  const headers = { Authorization: `Bearer ${key}` };
  if (env.OPENAI_ORG_ID) headers['OpenAI-Organization'] = env.OPENAI_ORG_ID;
  if (env.OPENAI_PROJECT_ID) headers['OpenAI-Project'] = env.OPENAI_PROJECT_ID;
  progress('키와 GPT-6.1 Terra 접근 권한을 확인하고 있어요.');
  let check;
  try { check = await fetchImpl(`https://api.openai.com/v1/models/${OPENAI_MODEL}`, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { throw new SetupError('OpenAI에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.'); }
  if (!check.ok) throw new SetupError(check.status === 401 ? 'API 키를 확인해 주세요. 유효하지 않거나 만료된 키입니다.' : check.status === 404 || check.status === 403 ? '이 키로 GPT-6.1 Terra를 사용할 수 없습니다. 프로젝트의 모델 권한을 확인해 주세요.' : 'OpenAI의 키 확인이 끝나지 않았습니다. 잠시 뒤 다시 눌러 주세요.');
  const metadata = await check.json().catch(() => null);
  if (metadata?.id !== OPENAI_MODEL) throw new SetupError('요청한 모델을 확인하지 못했습니다. 키를 저장하지 않았습니다.');

  const cliArgs = ['scripts/firebase-private.cjs'];
  const flags = ['--project', project, '--account', account, '--non-interactive'];
  progress('기존 Firebase 계정과 배포 권한을 확인하고 있어요.');
  await run([...cliArgs, 'projects:list', ...flags], { cwd: workspace });
  // Clear the obsolete confirmation flag; ordinary API mode does not claim ZDR.
  await saveEnv(envPath, text, { OPENAI_API_KEY: key, OPENAI_MODEL, OPENAI_ZDR_CONFIRMED: 'false' });
  progress('API 키를 서버 비밀 저장소에 등록하고 있어요.');
  // stdin only: no command-line key, temporary key file, or provider debug log.
  await run([...cliArgs, 'functions:secrets:set', 'OPENAI_API_KEY', '--data-file', '-', ...flags], { input: key, cwd: workspace });
  key = '';
  const functionEnvPath = path.join(workspace, 'functions/.env.maeum-835b3');
  await saveEnv(functionEnvPath, await readOptional(functionEnvPath), {
    OPENAI_ZDR_CONFIRMED: 'false', OPENAI_ORG_ID: env.OPENAI_ORG_ID || '', OPENAI_PROJECT_ID: env.OPENAI_PROJECT_ID || '',
  });

  progress('서버와 기본 활동을 검사하고 있어요.');
  await run(['scripts/prepare-firebase.mjs'], { cwd: workspace });
  await run(['--test', 'tests/*.test.mjs'], { cwd: workspace });
  progress('OpenAI 서버를 배포하고 있어요. 몇 분 걸릴 수 있어요.');
  await run([...cliArgs, 'deploy', '--only', 'functions', ...flags], { cwd: workspace });
  const health = await fetchImpl(`${site}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
  const status = health.ok ? await health.json().catch(() => null) : null;
  if (status?.model !== OPENAI_MODEL || status?.ready !== true) throw new SetupError('배포 후 서버 준비 상태를 확인하지 못했습니다. Codex에 연결 확인을 요청해 주세요.');
  progress('마음쉼 화면을 배포하고 있어요.');
  await run([...cliArgs, 'deploy', '--only', 'hosting', ...flags], { cwd: workspace });
  return { phase: 'done', keySaved: true, message: '마음쉼의 OpenAI 연결을 반영했어요. maeum.web.app에서 AI 대화 설정을 열어 주세요. 실제 대화 시험은 아직 별도로 확인해야 해요.' };
}

export async function createKeySetupServer({ workspace = root, register = registerKey } = {}) {
  const token = randomBytes(32).toString('hex');
  const nonce = randomBytes(24).toString('base64');
  const saved = parseEnv(await readOptional(path.join(workspace, '.env')));
  let status = { phase: 'idle', busy: false, keySaved: Boolean(saved.OPENAI_API_KEY?.trim()), message: 'API 키를 붙여 넣고 등록 버튼을 눌러 주세요.' };
  let origin;
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'` }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (req.headers.host !== new URL(origin).host) { send(403, { error: '이 컴퓨터에서만 열 수 있는 화면입니다.' }); return; }
    if (req.method === 'GET' && req.url === '/') {
      const page = (await readFile(path.join(root, 'scripts/openai-key-setup.html'), 'utf8')).replaceAll('__NONCE__', nonce).replace('__CSRF__', token);
      send(200, page, 'text/html; charset=utf-8'); return;
    }
    if (req.method === 'GET' && req.url === '/status') { send(200, status); return; }
    if (req.method !== 'POST' || !['/register', '/resume'].includes(req.url)) { send(404, { error: '화면을 다시 열어 주세요.' }); return; }
    const supplied = Buffer.from(req.headers['x-setup-token'] || '');
    if (req.headers.origin !== origin || supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token)) || !req.headers['content-type']?.startsWith('application/json')) { send(403, { error: '키 입력 화면에서 다시 눌러 주세요.' }); return; }
    if (status.busy) { send(409, { error: '이미 등록을 진행하고 있어요.' }); return; }
    let data;
    try {
      let total = 0; const chunks = [];
      for await (const chunk of req) { total += chunk.length; if (total > 4096) throw new Error(); chunks.push(chunk); }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { send(400, { error: 'API 키만 붙여 넣어 주세요.' }); return; }
    const local = req.url === '/resume' ? parseEnv(await readOptional(path.join(workspace, '.env'))) : null;
    let key = local ? local.OPENAI_API_KEY : data.key;
    data = null;
    if (typeof key !== 'string' || !/^sk-(?!admin-)[A-Za-z0-9_-]{20,}$/.test(key.trim())) { send(400, { error: 'OpenAI 프로젝트 API 키를 붙여 넣어 주세요.' }); return; }
    if (status.busy) { send(409, { error: '이미 등록을 진행하고 있어요.' }); return; }
    status = { ...status, phase: 'working', busy: true, message: '키 등록을 시작했어요.' };
    send(202, { accepted: true });
    register(key, { workspace, progress: message => { status = { ...status, message }; } })
      .then(result => { status = { ...result, busy: false }; })
      .catch(async error => { const stored = parseEnv(await readOptional(path.join(workspace, '.env'))); status = { phase: 'error', busy: false, keySaved: Boolean(stored.OPENAI_API_KEY?.trim()), message: error instanceof SetupError ? error.message : '등록을 마치지 못했습니다. Codex에 현재 상태를 알려 주세요.' }; });
    key = '';
  });
  server.requestTimeout = 30000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: origin };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, url } = await createKeySetupServer();
  await mkdir(path.join(root, '.local'), { recursive: true });
  await writeFile(path.join(root, '.local/openai-key-setup-session.json'), JSON.stringify({ url, pid: process.pid }));
  console.log(`마음쉼 API 키 입력: ${url}`);
  if (process.argv.includes('--open')) spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  setTimeout(() => server.close(), 4 * 60 * 60 * 1000).unref();
}
