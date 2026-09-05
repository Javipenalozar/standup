'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const adminAuth = require('../netlify/lib/admin-auth');

test('admin session is signed, expires and is accepted from an HttpOnly cookie', () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  process.env.ADMIN_PASSWORD = 'test-admin-password-long';

  try {
    const now = Date.now();
    const token = adminAuth.createSession(now);
    assert.equal(adminAuth.verifySession(token, now + 1000), true);
    assert.equal(adminAuth.verifySession(token + 'tampered', now + 1000), false);
    assert.equal(adminAuth.verifySession(token, now + adminAuth.SESSION_TTL_SECONDS * 1000 + 1), false);
    assert.equal(adminAuth.verifyPassword('test-admin-password-long'), true);
    assert.equal(adminAuth.verifyPassword('wrong-password'), false);
    assert.equal(adminAuth.isAuthorizedEvent({
      headers: { cookie: adminAuth.sessionCookie(token).split(';')[0] },
    }), true);

    const cookie = adminAuth.sessionCookie(token);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
  } finally {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});

test('admin session refuses weak or missing server configuration', () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_SESSION_SECRET;
  try {
    assert.throws(() => adminAuth.createSession(), /ADMIN_SESSION_SECRET/);
    assert.equal(adminAuth.verifySession('invalid'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
