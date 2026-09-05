'use strict';

const crypto = require('node:crypto');

const COOKIE_NAME = '__Host-st_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failuresByClient = new Map();

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || '');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signature(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function createSession(now = Date.now()) {
  if (sessionSecret().length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');
  }
  const payload = base64url(JSON.stringify({ version: 1, expiresAt: now + SESSION_TTL_SECONDS * 1000 }));
  return payload + '.' + signature(payload);
}

function parseCookies(header) {
  return String(header || '').split(';').reduce((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator < 1) return cookies;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) cookies[name] = value;
    return cookies;
  }, {});
}

function verifySession(token, now = Date.now()) {
  if (!token || sessionSecret().length < 32) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2 || !timingSafeEqual(parts[1], signature(parts[0]))) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.version === 1 && Number.isFinite(payload.expiresAt) && payload.expiresAt > now;
  } catch {
    return false;
  }
}

function headerValue(headers, name) {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1] || '') : '';
}

function isAuthorizedEvent(event) {
  const cookies = parseCookies(headerValue(event?.headers, 'cookie'));
  return verifySession(cookies[COOKIE_NAME]);
}

function isAuthorizedRequest(request) {
  return verifySession(parseCookies(request?.headers?.get('cookie'))[COOKIE_NAME]);
}

function verifyPassword(password) {
  const expected = String(process.env.ADMIN_PASSWORD || '');
  return expected.length >= 12 && timingSafeEqual(password, expected);
}

function clientKey(headers) {
  const forwarded = headerValue(headers, 'x-forwarded-for').split(',')[0].trim();
  const direct = headerValue(headers, 'x-nf-client-connection-ip').trim();
  const agent = headerValue(headers, 'user-agent').slice(0, 160);
  return crypto.createHash('sha256').update((direct || forwarded || 'unknown') + '|' + agent).digest('hex');
}

function pruneFailures(now = Date.now()) {
  for (const [key, values] of failuresByClient.entries()) {
    const current = values.filter(timestamp => now - timestamp < FAILURE_WINDOW_MS);
    if (current.length) failuresByClient.set(key, current);
    else failuresByClient.delete(key);
  }
}

function isRateLimited(headers, now = Date.now()) {
  pruneFailures(now);
  return (failuresByClient.get(clientKey(headers)) || []).length >= MAX_FAILURES;
}

function recordFailure(headers, now = Date.now()) {
  const key = clientKey(headers);
  const current = (failuresByClient.get(key) || []).filter(timestamp => now - timestamp < FAILURE_WINDOW_MS);
  failuresByClient.set(key, [...current, now]);
}

function clearFailures(headers) {
  failuresByClient.delete(clientKey(headers));
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  clearFailures,
  createSession,
  expiredSessionCookie,
  isAuthorizedEvent,
  isAuthorizedRequest,
  isRateLimited,
  recordFailure,
  sessionCookie,
  verifyPassword,
  verifySession,
};
