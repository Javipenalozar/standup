'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pricing = require('../seat-pricing');
const { EVENT, LEGAL } = require('../netlify/lib/event-config');
const webhook = require('../netlify/functions/bold-webhook')._test;
const background = require('../netlify/functions/bold-webhook-process-background')._test;

test('the venue map contains 239 valid seats with the agreed price distribution', () => {
  const seats = [];
  for (const row of 'ABCDEFGHIJ') {
    for (let number = 1; number <= 22; number += 1) seats.push(row + '-' + number);
  }
  for (let number = 1; number <= 19; number += 1) seats.push('K-' + number);

  assert.equal(seats.length, 239);
  assert.ok(seats.every(seat => pricing.isValidSeat(seat)));
  const counts = seats.reduce((result, seat) => {
    const tier = pricing.getTierForSeat(seat).id;
    result[tier] = (result[tier] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { lateral: 60, preventa: 143, preferencial: 36 });
});

test('event and legal versions match the current edition', () => {
  assert.equal(EVENT.id, 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026');
  assert.equal(EVENT.date, 'jueves 5 de noviembre de 2026');
  assert.equal(EVENT.time, '7:00 p. m.');
  assert.equal(LEGAL.controllerAddress, 'Calle 23G No. 81-66');
  assert.equal(LEGAL.privacyPolicyVersion, '2026-09-04');
  assert.equal(LEGAL.termsVersion, '2026-09-04');
  assert.equal(require('../netlify/lib/event-config').realPaymentsEnabled(), false);
});

test('Bold signature and documented fields are parsed', () => {
  const secret = 'test-secret';
  const payload = {
    id: 'evt-1',
    type: 'SALE_APPROVED',
    subject: 'PAY-1',
    data: {
      payment_id: 'PAY-1',
      amount: { currency: 'COP', total: 187000 },
      metadata: { reference: 'LNK_TEST' },
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(rawBody).toString('base64'))
    .digest('hex');

  assert.equal(webhook.verifyBoldSignature(rawBody, signature, secret), true);
  assert.equal(webhook.verifyBoldSignature(rawBody + ' ', signature, secret), false);
  assert.deepEqual(background.eventFields(payload, rawBody), {
    providerEventId: 'evt-1',
    eventType: 'SALE_APPROVED',
    reference: 'LNK_TEST',
    paymentId: 'PAY-1',
    amount: 187000,
    currency: 'COP',
  });
});

test('only the isolated event schema is referenced by runtime code', () => {
  const functionDir = path.join(root, 'netlify/functions');
  const source = fs.readdirSync(functionDir)
    .filter(name => /\.(js|mjs)$/.test(name))
    .map(name => fs.readFileSync(path.join(functionDir, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /\/rest\/v1\/reservations(?:\?|['"])/);
  assert.doesNotMatch(source, /\/rest\/v1\/invitations(?:\?|['"])/);
  assert.match(source, /\/rest\/v1\/st_event_reservations/);
  assert.match(source, /\/rest\/v1\/st_event_invitations/);
});

test('the canonical SQL denies browser roles and exposes only service-role RPCs', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase-event-schema.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.st_event_reservations/);
  assert.match(sql, /create table if not exists public\.st_payment_webhook_events/);
  assert.match(sql, /st_ticket_checkin_events_reservation_idx/);
  assert.match(sql, /revoke all on table public\.st_event_reservations from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.st_apply_bold_webhook[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /from public\.st_event_reservations\s+from public\.st_event_reservations/);
});

test('checkout and invitation require explicit legal acceptance', () => {
  for (const page of ['inscribirse/index.html', 'invitado/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /id="privacyConsent"/);
    assert.match(html, /id="termsAccepted"/);
    assert.match(html, /privacyConsent:/);
    assert.match(html, /termsAccepted:/);
  }
  const legal = fs.readFileSync(path.join(root, 'legal/index.html'), 'utf8');
  assert.match(legal, /Política de tratamiento de datos/);
  assert.match(legal, /Términos de compra y asistencia/);
  assert.match(legal, /JV Bienestar y Salud Mental S\.A\.S\., NIT 901912952-9/);
  assert.match(legal, /jvbienestarysaludmental@javipenaloza\.com/);
  assert.match(legal, /Calle 23G No\. 81-66/);
});

test('the withdrawn 99 thousand price is absent from public and server sources', () => {
  const sources = [
    'index.html',
    'netlify/lib/event-config.js',
    'legal/index.html',
    'LOCAL-REVIEW.md',
  ].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /99(?:\.000|000)/);
});

test('admin pages use one signed session and a dedicated rate-limited login', async () => {
  for (const page of ['admin/index.html', 'admin/check-in/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1].trim())
      .filter(Boolean);
    scripts.forEach(source => assert.doesNotThrow(() => new Function(source)));
    assert.match(html, /\/\.netlify\/functions\/admin-session/);
    assert.match(html, /\/\.netlify\/functions\/admin-login/);
    assert.doesNotMatch(html, /password:\s*adminPassword/);
    assert.doesNotMatch(html, /#87f2ff|rgba\(135,\s*242,\s*255/i);
  }

  const login = await import('../netlify/functions/admin-login.mjs');
  assert.equal(login.config.path, '/.netlify/functions/admin-login');
  assert.deepEqual(login.config.rateLimit, {
    action: 'rate_limit',
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ['ip', 'domain'],
  });

  const sessionSource = fs.readFileSync(path.join(root, 'netlify/functions/admin-session.mjs'), 'utf8');
  assert.doesNotMatch(sessionSource, /verifyPassword|recordFailure|createSession/);

  for (const name of [
    'admin-data.js',
    'crear-invitacion.js',
    'resend-ticket.js',
    'send-reminder-campaign.js',
    'send-reminder-preview.js',
  ]) {
    const source = fs.readFileSync(path.join(root, 'netlify/functions', name), 'utf8');
    assert.match(source, /adminAuth\.isAuthorizedEvent/);
    assert.doesNotMatch(source, /password\s*!==\s*process\.env\.ADMIN_PASSWORD/);
  }
});

test('ticket navigation opens the seat selector and inherited turquoise is absent', () => {
  const landing = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const selector = fs.readFileSync(path.join(root, 'inscribirse/index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  assert.match(landing, /href="\/inscribirse\/">Boletas<\/a>/);
  assert.match(selector, /href="\/inscribirse\/">Boletas<\/a>/);
  assert.doesNotMatch(styles, /#3fa594|rgba\(63,\s*165,\s*148/i);
});

test('real operations remain guarded by default', async () => {
  const priorPayments = process.env.ENABLE_REAL_PAYMENTS;
  const priorOperations = process.env.ENABLE_EVENT_OPERATIONS;
  delete process.env.ENABLE_REAL_PAYMENTS;
  delete process.env.ENABLE_EVENT_OPERATIONS;

  try {
    const createPayment = require('../netlify/functions/crear-pago-bold').handler;
    const createInvitation = require('../netlify/functions/crear-invitacion').handler;
    const paymentResponse = await createPayment({ httpMethod: 'POST', body: '{}' });
    const invitationResponse = await createInvitation({ httpMethod: 'POST', body: '{}' });
    assert.equal(paymentResponse.statusCode, 503);
    assert.equal(invitationResponse.statusCode, 503);
  } finally {
    if (priorPayments === undefined) delete process.env.ENABLE_REAL_PAYMENTS;
    else process.env.ENABLE_REAL_PAYMENTS = priorPayments;
    if (priorOperations === undefined) delete process.env.ENABLE_EVENT_OPERATIONS;
    else process.env.ENABLE_EVENT_OPERATIONS = priorOperations;
  }
});
