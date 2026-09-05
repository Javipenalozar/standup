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

test('dedicated admin login creates a session and the legacy POST path is closed', async () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  process.env.ADMIN_PASSWORD = 'test-admin-password-long';

  try {
    const login = (await import('../netlify/functions/admin-login.mjs')).default;
    const session = (await import('../netlify/functions/admin-session.mjs')).default;
    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'admin-login-contract-test',
      'X-Nf-Client-Connection-Ip': '192.0.2.10',
    };

    const wrong = await login(new Request('https://standup.eventosjv.com/.netlify/functions/admin-login', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ password: 'wrong-password' }),
    }));
    assert.equal(wrong.status, 401);

    const correct = await login(new Request('https://standup.eventosjv.com/.netlify/functions/admin-login', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ password: 'test-admin-password-long' }),
    }));
    assert.equal(correct.status, 200);
    assert.match(correct.headers.get('set-cookie'), /__Host-st_admin_session=.*HttpOnly/);

    const cookie = correct.headers.get('set-cookie').split(';')[0];
    const restored = await session(new Request('https://standup.eventosjv.com/.netlify/functions/admin-session', {
      headers: { Cookie: cookie },
    }));
    assert.equal(restored.status, 200);

    const bypass = await session(new Request('https://standup.eventosjv.com/.netlify/functions/admin-session', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ password: 'test-admin-password-long' }),
    }));
    assert.equal(bypass.status, 405);
  } finally {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});
