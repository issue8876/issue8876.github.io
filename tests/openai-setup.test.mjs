import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { updateEnvText, registerKey, createKeySetupServer } from '../scripts/openai-key-setup.mjs';

const key = 'sk-unit-test-placeholder-only-for-setup-tests';
const model = 'gpt-6.1-terra';
async function workspace(t, env = '') {
  const dir = await mkdtemp(path.join(tmpdir(), 'maeum-key-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'functions'));
  await writeFile(path.join(dir, '.env'), env);
  await writeFile(path.join(dir, 'functions/.env.maeum-835b3'), 'APP_CHECK_SITE_KEY=public-existing-site-key\n');
  return dir;
}

test('key setup preserves unrelated settings and removes duplicate updated entries', () => {
  const text = updateEnvText('# keep\r\nCOACH_JOIN_CODE=0123\r\nOPENAI_API_KEY=old\r\nexport OPENAI_API_KEY=duplicate\r\n', { OPENAI_API_KEY: key, OPENAI_ZDR_CONFIRMED: 'false' });
  assert.match(text, /# keep/); assert.equal(parseEnv(text).COACH_JOIN_CODE, '0123');
  assert.equal(text.match(/OPENAI_API_KEY=/g).length, 1); assert.equal(parseEnv(text).OPENAI_API_KEY, key);
  assert.throws(() => updateEnvText('', { OPENAI_API_KEY: 'injected\nBAD=true' }));
});

test('ordinary API key is stored privately and deployed without sending chat', async t => {
  const dir = await workspace(t, 'COACH_JOIN_CODE=0123\nGEMINI_API_KEY=old-provider-setting\n');
  const calls = [], requests = [];
  const result = await registerKey(key, { workspace: dir, fetchImpl: async (url, init) => { requests.push(url); if (url.includes('/models/')) assert.equal(init.headers.Authorization, `Bearer ${key}`); assert.equal(init.body, undefined); return Response.json(url.includes('/models/') ? { id: model } : { ready: true, model }); }, run: async (args, opts) => calls.push({ args, opts }) });
  assert.equal(result.phase, 'done'); assert.equal(result.keySaved, true);
  assert.deepEqual(requests, [`https://api.openai.com/v1/models/${model}`, 'https://maeum.web.app/api/health']);
  assert.ok(calls.some(call => call.args.includes('deploy')));
  for (const call of calls) assert.ok(!call.args.join(' ').includes(key));
  const secret = calls.find(call => call.args.includes('functions:secrets:set'));
  assert.equal(secret.opts.input, key); assert.ok(secret.args.includes('-')); assert.ok(!secret.args.includes('--force'));
  const local = parseEnv(await readFile(path.join(dir, '.env'), 'utf8'));
  assert.equal(local.OPENAI_API_KEY, key); assert.equal(local.COACH_JOIN_CODE, '0123'); assert.equal(local.GEMINI_API_KEY, 'old-provider-setting'); assert.equal(local.OPENAI_ZDR_CONFIRMED, 'false');
  const cloud = parseEnv(await readFile(path.join(dir, 'functions/.env.maeum-835b3'), 'utf8'));
  assert.equal(cloud.APP_CHECK_SITE_KEY, 'public-existing-site-key'); assert.equal(cloud.OPENAI_ZDR_CONFIRMED, 'false'); assert.ok(!JSON.stringify(cloud).includes(key));
});

test('ordinary API setup clears obsolete ZDR claims; invalid keys never touch files or CLI', async t => {
  const original = `OPENAI_API_KEY=sk-old-placeholder-key-value-for-tests\nOPENAI_ZDR_CONFIRMED=true\n`;
  const dir = await workspace(t, original);
  let calls = 0;
  for (const candidate of ['', 'not-a-key', 'sk-admin-must-not-use-this-credential-here']) {
    await assert.rejects(registerKey(candidate, { workspace: dir, fetchImpl: async () => { calls++; }, run: async () => { calls++; } }));
  }
  assert.equal(calls, 0); assert.equal(await readFile(path.join(dir, '.env'), 'utf8'), original);
  const result = await registerKey(key, { workspace: dir, fetchImpl: async url => Response.json(url.includes('/models/') ? { id: model } : { ready: true, model }), run: async () => {} });
  assert.equal(result.phase, 'done'); assert.equal(parseEnv(await readFile(path.join(dir, '.env'), 'utf8')).OPENAI_ZDR_CONFIRMED, 'false');
});

test('invalid provider credentials do not overwrite a working local key or expose provider errors', async t => {
  const dir = await workspace(t, 'OPENAI_API_KEY=existing-key\n');
  let calls = 0;
  await assert.rejects(registerKey(key, { workspace: dir, fetchImpl: async () => new Response('private upstream error', { status: 401 }), run: async () => { calls++; } }), error => !error.message.includes('private upstream'));
  assert.equal(calls, 0); assert.equal(parseEnv(await readFile(path.join(dir, '.env'), 'utf8')).OPENAI_API_KEY, 'existing-key');
});

test('saved ordinary API key deploys functions before the screen and verifies public health', async t => {
  const dir = await workspace(t, `OPENAI_API_KEY=${key}\n`);
  const order = [];
  const result = await registerKey(key, { workspace: dir, fetchImpl: async url => { order.push(url); return Response.json(url.includes('/models/') ? { id: model } : { ready: true, model }); }, run: async args => order.push(args.join(' ')) });
  assert.equal(result.phase, 'done');
  const func = order.findIndex(item => item.includes('deploy --only functions'));
  const health = order.findIndex(item => item.endsWith('/api/health'));
  const hosting = order.findIndex(item => item.includes('deploy --only hosting'));
  assert.ok(func >= 0 && health > func && hosting > health);
});

test('local key screen never returns a saved key and rejects cross-origin or concurrent registration', async t => {
  const dir = await workspace(t, `OPENAI_API_KEY=${key}\n`);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const { server, url } = await createKeySetupServer({ workspace: dir, register: async value => { assert.equal(value, key); entered(); await pending; return { phase: 'done', keySaved: true, message: 'saved' }; } });
  t.after(() => new Promise(resolve => server.close(resolve)));
  t.after(() => release());
  const page = await fetch(url); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await page.text(); assert.ok(!html.includes(key)); assert.match(html, /type="password"/);
  const token = html.match(/const token='([a-f0-9]+)'/)[1];
  const status = await (await fetch(url + '/status')).text(); assert.ok(!status.includes(key)); assert.equal(JSON.parse(status).keySaved, true);
  const post = (origin, auth) => fetch(url + '/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Setup-Token': auth }, body: JSON.stringify({ key }) });
  assert.equal((await post('https://evil.example', token)).status, 403);
  assert.equal((await post(url, 'bad-token')).status, 403);
  assert.equal((await post(url, token)).status, 202); await started;
  assert.equal((await post(url, token)).status, 409);
  const busy = await (await fetch(url + '/status')).json(); assert.equal(busy.busy, true); assert.ok(!JSON.stringify(busy).includes(key));
  release();
});
