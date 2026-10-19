import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { coachReply, createLimiter, HttpError, isReady } from './coach.mjs';
import { createSessions } from './access.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const allowedStatic = /^(?:index\.html|pages\/[a-zA-Z0-9_-]+\.html|(?:css|js|assets)\/[a-zA-Z0-9_./-]+)$/;

async function readJSON(req) {
  const type = req.headers['content-type'] || '';
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON 형식으로 보내 줘.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 64000) throw new HttpError(413, '메시지가 너무 길어. 짧게 나눠서 적어 줘.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, '메시지 형식을 확인해 줘.'); }
}
export function createApp({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS || 'http://localhost:8787,http://127.0.0.1:8787').split(',').map(x => x.trim()).filter(Boolean));
  const chatLimit = createLimiter({ limit: 12 });
  const authLimit = createLimiter({ limit: 5, now });
  const globalAuthLimit = createLimiter({ limit: 30, maxKeys: 1, now });
  const sessions = createSessions({ code: env.COACH_JOIN_CODE, now });
  const joinFailures = new Map();
  const globalLimit = createLimiter({ limit: 100, maxKeys: 1 });
  let inFlight = 0;
  return http.createServer(async (req, res) => {
    const headers = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
    };
    const origin = req.headers.origin;
    const isAPI = req.url?.startsWith('/api/');
    const send = (status, data) => { if (res.writableEnded) return; res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (isAPI && origin && !allowedOrigins.has(origin)) { send(403, { error: '이 사이트에서는 AI 서버에 연결할 수 없어.' }); return; }
    if (origin && allowedOrigins.has(origin)) { headers['Access-Control-Allow-Origin'] = origin; headers.Vary = 'Origin'; headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'; headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; }
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (isAPI) {
        if (url.pathname === '/api/health' && req.method === 'GET') { send(200, { ok: true, ready: isReady(env), model: 'gemini-3.8-flash' }); return; }
        if (!['/api/chat', '/api/session'].includes(url.pathname) || req.method !== 'POST') { send(404, { error: '요청한 기능을 찾을 수 없어.' }); return; }
        // A single trusted reverse proxy may provide a client IP. Never trust arbitrary X-Forwarded-For.
        const peer = env.TRUST_PROXY === 'true' ? (req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim() || req.socket.remoteAddress : req.socket.remoteAddress;
        if (url.pathname === '/api/session') {
          for (const [key, failure] of joinFailures) if (failure.until <= now()) joinFailures.delete(key);
          const failure = joinFailures.get(peer);
          if ((failure?.count || 0) >= 5 || !globalAuthLimit('all')) throw new HttpError(429, '연결 요청이 많아. 1분 뒤 다시 해 보거나 선생님께 코드를 확인해 줘.');
          if (!isReady(env)) throw new HttpError(503, '아직 연결을 준비하고 있어. 기본 활동은 지금 할 수 있어.');
          const body = await readJSON(req);
          const session = sessions.issue(body?.code);
          if (!session) {
            joinFailures.set(peer, { count: (failure?.count || 0) + 1, until: failure?.until || now() + 60000 });
            throw new HttpError(401, '코드가 맞지 않아. 선생님께 받은 숫자를 다시 확인해 줘.');
          }
          if (session.full) throw new HttpError(503, '지금 이용자가 많아. 잠시 뒤 다시 연결해 줘.');
          send(200, { ok: true, ...session }); return;
        }
        if (!sessions.accepts(req.headers.authorization)) {
          if (!authLimit(peer)) throw new HttpError(429, '요청이 많아. 1분 뒤 다시 시도해 줘.');
          throw new HttpError(401, '연결 시간이 지났어. 선생님께 받은 코드로 다시 연결해 줘.');
        }
        if (!isReady(env)) throw new HttpError(503, 'AI 연결 준비 중이야. 기본 활동을 이용해 줘.');
        const body = await readJSON(req);
        if (!chatLimit(peer) || !globalLimit('all') || inFlight >= 6) throw new HttpError(429, '지금 이용자가 많아. 잠시 뒤 다시 보내 줘.');
        inFlight++;
        try { send(200, await coachReply(body, env, fetchImpl)); } finally { inFlight--; }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { send(405, { error: '지원하지 않는 요청' }); return; }
      let relative;
      try { relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'; } catch { throw new HttpError(400, '잘못된 경로'); }
      // Serve an explicit frontend allowlist; .env, repository data and server source are never served.
      if (!allowedStatic.test(relative) || relative.split('/').some(part => part.startsWith('.') || part === '..')) { send(404, { error: '페이지를 찾을 수 없어.' }); return; }
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) { send(404, { error: '페이지를 찾을 수 없어.' }); return; }
      const ext = path.extname(filename); if (!mime[ext]) { send(404, { error: '페이지를 찾을 수 없어.' }); return; }
      if (!(await stat(filename)).isFile()) throw new HttpError(404, '페이지를 찾을 수 없어.');
      const data = await readFile(filename); res.writeHead(200, { ...headers, 'Content-Type': mime[ext] }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error instanceof HttpError ? error.message : '잠시 문제가 생겼어. 다시 시도해 줘.' }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787); const host = process.env.HOST || '127.0.0.1';
  const server = createApp(); server.requestTimeout = 40000; server.headersTimeout = 10000;
  server.listen(port, host, () => console.log(`마음쉼 http://${host}:${port}/pages/maeum.html · AI ${isReady(process.env) ? 'ready' : 'not configured'}`));
}
