'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../netlify/lib/admin-auth');
const { EVENT } = require('../event-config');

test('enabled invitation, resend and check-in require a signed session and scope requests to the new event', async () => {
  const previous = { ...process.env };
  const originalRequest = https.request;
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    ENABLE_EVENT_OPERATIONS: 'true', EVENT_RELEASE_ID: EVENT.id,
    ADMIN_SESSION_SECRET: 'test-session-secret-with-more-than-32-characters',
    SUPABASE_URL: 'https://db.example.invalid', SUPABASE_KEY: 'fixture-key',
    EVENT_PUBLIC_URL: 'https://standup.eventosjv.com',
    RESEND_API_KEY: 'fixture-mail-key',
    RESEND_FROM: 'Stand-Up Therapy <entradas@example.invalid>',
    RESEND_REPLY_TO: 'operacion@example.invalid',
  });
  const calls = [];
  let responses = [];
  https.request = (options, callback) => {
    const request = new EventEmitter();
    let body = '';
    request.write = chunk => { body += chunk; };
    request.end = () => {
      calls.push({ ...options, body });
      const next = responses.shift();
      assert(next, 'Unexpected external request');
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      process.nextTick(() => { response.emit('data', JSON.stringify(next)); response.emit('end'); });
    };
    return request;
  };
  try {
    const headers = { cookie: '__Host-st_admin_session=' + auth.createSession() };
    const create = require('../netlify/functions/crear-invitacion').handler;
    const resend = require('../netlify/functions/resend-ticket').handler;
    const checkin = (await import('../netlify/functions/check-in.mjs')).default;
    for (const handler of [create, resend]) {
      assert.equal((await handler({ httpMethod: 'POST', headers: {}, body: '{}' })).statusCode, 401);
    }
    assert.equal((await checkin(new Request('https://site.test/check-in', { method: 'POST', body: '{}' }))).status, 401);

    responses = [[{ id: 'fixture-invitation' }]];
    const created = await create({ httpMethod: 'POST', headers, body: JSON.stringify({ nombre: 'Prueba', cantidad: 2 }) });
    assert.equal(created.statusCode, 200);
    assert.equal(JSON.parse(calls[0].body).event_id, EVENT.id);
    assert.match(JSON.parse(created.body).link, /^https:\/\/standup\.eventosjv\.com\/invitado\//);

    const reservation = { seat_id: 'K-19', qr_code: 'INV-FIXTURE', payment_status: 'paid', customer_name: 'Prueba', customer_email: 'audit@example.invalid' };
    responses = [[reservation], { id: 'fixture-email' }];
    const resent = await resend({ httpMethod: 'POST', headers, body: JSON.stringify({ qrCode: reservation.qr_code }) });
    assert.equal(JSON.parse(resent.body).sent, true);
    assert.match(calls[1].path, new RegExp('event_id=eq.' + encodeURIComponent(EVENT.id)));
    const email = JSON.parse(calls[2].body);
    assert.equal(email.from, process.env.RESEND_FROM);
    assert.equal(email.reply_to, process.env.RESEND_REPLY_TO);
    assert.match(email.html, /18 de febrero de 2027/);

    const fetches = [];
    global.fetch = async (url, options) => {
      fetches.push({ url: String(url), ...options });
      return Response.json(options.method === 'POST' ? [{ seat_id: 'K-19' }] : [reservation]);
    };
    const checked = await checkin(new Request('https://site.test/check-in', {
      method: 'POST', headers, body: JSON.stringify({ action: 'checkin', code: reservation.qr_code, seatIds: ['K-19'], operator: 'Prueba' }),
    }));
    assert.equal(checked.status, 200);
    assert.equal(JSON.parse(fetches[1].body).p_event_id, EVENT.id);
    assert.equal(JSON.parse(fetches[1].body).p_action, 'checkin');
    assert.deepEqual((await checked.json()).changedSeats, ['K-19']);
    assert.equal(responses.length, 0);
  } finally {
    https.request = originalRequest;
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('the checkout share image resolves to a bundled public asset', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'inscribirse/index.html'), 'utf8');
  const source = html.match(/property="og:image" content="([^"]+)"/)[1];
  const image = new URL(source);
  assert.equal(image.origin, 'https://standup.eventosjv.com');
  assert(fs.existsSync(path.join(root, image.pathname)));
  assert(fs.readFileSync(path.join(root, 'scripts/build.js'), 'utf8').includes(image.pathname.slice(1)));
});
