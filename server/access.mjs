import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function validJoinCode(code) {
  return typeof code === 'string' && /^[0-9]{4,6}$/.test(code);
}

// Signed, short-lived sessions work across function restarts without storing chats.
// Rotating either the signing secret or classroom code invalidates all old tokens.
export function createSignedSessions({ code, secret, now = Date.now, ttlMs = 3600000 } = {}) {
  if (!validJoinCode(code) || typeof secret !== 'string' || secret.length < 32) throw new Error('Session secrets are not configured');
  const key = createHmac('sha256', secret).update(code).digest();
  const sign = payload => createHmac('sha256', key).update(payload).digest('base64url');
  return {
    issue(supplied) {
      if (!validJoinCode(supplied) || supplied.length !== code.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(code))) return null;
      const payload = Buffer.from(JSON.stringify({ v: 1, exp: now() + ttlMs, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
      return { token: `${payload}.${sign(payload)}`, expiresIn: ttlMs / 1000 };
    },
    accepts(header) {
      if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 1024) return false;
      const parts = header.slice(7).split('.');
      if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return false;
      const expected = Buffer.from(sign(parts[0])), actual = Buffer.from(parts[1]);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
      try { const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); return claims.v === 1 && Number.isSafeInteger(claims.exp) && claims.exp > now() && claims.exp <= now() + ttlMs && typeof claims.nonce === 'string'; } catch { return false; }
    },
  };
}

// A short classroom code is exchanged once, never used as a chat bearer token.
// This controls access to the service; it does not verify age or provider eligibility.
export function createSessions({ code, now = Date.now, ttlMs = 3600000, maxSessions = 200 } = {}) {
  const sessions = new Map();
  function prune() {
    const time = now();
    for (const [token, expiresAt] of sessions) if (expiresAt <= time) sessions.delete(token);
  }
  return {
    issue(supplied) {
      if (!validJoinCode(code) || !validJoinCode(supplied)) return null;
      const actual = Buffer.from(supplied), expected = Buffer.from(code);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      prune();
      if (sessions.size >= maxSessions) return { full: true };
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, now() + ttlMs);
      return { token, expiresIn: ttlMs / 1000 };
    },
    accepts(header) {
      prune();
      if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
      return sessions.has(header.slice(7));
    },
  };
}
