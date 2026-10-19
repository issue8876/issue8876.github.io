import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSignedSessions } from '../server/access.mjs';
import { createFirebaseHandler } from '../functions/handler.mjs';

const settings = { projectId: 'maeum-test', hostingSites: ['maeum-test-short'], apiKey: 'test-provider-key', joinCode: '0123', signingKey: 'test-only-secret-with-at-least-32-characters', appCheckSiteKey: 'test-public-site-key' };
test('signed sessions survive instance changes and reject tampering, expiry and code rotation', () => {
  let now = 0;
  const make = (extra = {}) => createSignedSessions({ code: settings.joinCode, secret: settings.signingKey, now: () => now, ...extra });
  const a = make(), b = make();
  assert.equal(a.issue('123'), null);
  const token = a.issue('0123').token;
  assert.equal(b.accepts(`Bearer ${token}`), true);
  assert.equal(b.accepts(`Bearer ${token}x`), false);
  assert.equal(b.accepts('Bearer 0123'), false);
  assert.equal(make({ code: '4567' }).accepts(`Bearer ${token}`), false);
  assert.equal(make({ secret: 'another-test-key-with-at-least-32-characters' }).accepts(`Bearer ${token}`), false);
  now = 3600000; assert.equal(b.accepts(`Bearer ${token}`), false);
  assert.throws(() => make({ secret: '' }));
});

test('Firebase HTTP adapter verifies App Check, consumes rawBody, keeps secrets private and preserves filters', async t => {
  let providerCalls = 0;
  const handler = createFirebaseHandler({
    getSettings: () => settings,
    verifyAppCheck: async token => { if (token !== 'test-app-check') throw new Error('private validation error'); return { appId: 'test-app' }; },
    fetchImpl: async () => { providerCalls++; return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: '어떤 방법부터 해 보고 싶어?' }] }] }); },
  });
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); req.rawBody = Buffer.concat(chunks);
    req.path = new URL(req.url, 'http://localhost').pathname; req.ip = req.socket.remoteAddress; req.get = name => req.headers[name.toLowerCase()];
    res.set = (k, v) => res.setHeader(k, v); res.status = code => { res.statusCode = code; return res; }; res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    await handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: 'https://maeum-test.web.app', 'X-Firebase-AppCheck': 'test-app-check' };
  const post = (path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const publicConfig = await (await fetch(base + '/api/config')).text();
  assert.deepEqual(JSON.parse(publicConfig), { appCheckSiteKey: settings.appCheckSiteKey });
  for (const secret of [settings.apiKey, settings.joinCode, settings.signingKey]) assert.ok(!publicConfig.includes(secret));
  assert.equal((await post('/api/session', { code: '0123' }, { 'X-Firebase-AppCheck': '' })).status, 403);
  assert.equal((await post('/api/session', { code: '0123' }, { 'X-Firebase-AppCheck': 'invalid' })).status, 403);
  assert.equal((await post('/api/session', { code: '0123' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/session', { code: '0123' }, { Origin: 'https://maeum-test-short.web.app' })).status, 200);
  assert.equal((await post('/api/chat', { profile: 'upper', messages: [{ role: 'user', text: '숙제가 어려워' }] }, { Origin: 'https://maeum-test-short.web.app' })).status, 401);
  assert.equal((await post('/api/session', 'bad json')).status, 400);
  assert.equal((await post('/api/session', 'x'.repeat(64001))).status, 413);
  const joined = await post('/api/session', { code: '0123' }); assert.equal(joined.status, 200);
  const token = (await joined.json()).token;
  const chatBody = text => ({ profile: 'upper', topic: 'study', messages: [{ role: 'user', text }] });
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await post('/api/chat', chatBody('숙제가 어려워'), auth)).status, 200);
  assert.equal((await (await post('/api/chat', chatBody('죽고 싶어'), auth)).json()).safety, true);
  assert.equal(providerCalls, 1);
  assert.equal((await fetch(base + '/server/coach.mjs')).status, 404);
});
