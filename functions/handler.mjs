import { createHandler } from './runtime/server/index.mjs';
import { createSignedSessions } from './runtime/server/access.mjs';

export function createFirebaseHandler({ getSettings, verifyAppCheck, fetchImpl = fetch }) {
  let handler;
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.path.startsWith('/api/')) { res.status(404).json({ error: '요청한 기능을 찾을 수 없어.' }); return; }
    if (req.method === 'POST') {
      try {
        const token = req.get('X-Firebase-AppCheck');
        if (!token || !(await verifyAppCheck(token))?.appId) throw new Error('Invalid App Check');
      } catch { res.status(403).json({ error: '이 화면에서 연결을 확인하지 못했어. 새로고침한 뒤 다시 해 줘.' }); return; }
    }
    try {
      const settings = getSettings();
      if (req.path === '/api/config' && req.method === 'GET') { res.json({ appCheckSiteKey: settings.appCheckSiteKey }); return; }
      if (!handler) {
        if (!settings.projectId) throw new Error('Missing project');
        const env = {
          OPENAI_API_KEY: settings.apiKey, OPENAI_ORG_ID: settings.openaiOrg, OPENAI_PROJECT_ID: settings.openaiProject, COACH_JOIN_CODE: settings.joinCode,
          ALLOWED_ORIGINS: [settings.projectId, ...(settings.hostingSites || [])].flatMap(site => [`https://${site}.web.app`, `https://${site}.firebaseapp.com`]).join(','),
        };
        handler = createHandler({ env, fetchImpl, sessionStore: createSignedSessions({ code: env.COACH_JOIN_CODE, secret: settings.signingKey }), resolvePeer: request => request.ip || request.socket.remoteAddress });
      }
      await handler(req, res);
    } catch { if (!res.headersSent) res.status(503).json({ error: '운영자가 연결을 준비하고 있어. 기본 활동은 계속할 수 있어.' }); }
  };
}
