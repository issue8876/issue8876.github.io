import { randomBytes, timingSafeEqual } from 'node:crypto';

export function validJoinCode(code) {
  return typeof code === 'string' && /^[0-9]{4,6}$/.test(code);
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
