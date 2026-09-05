'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const test = require('node:test');

const EVENT_ID = 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026';

function signatureFor(rawBody, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(rawBody).toString('base64'))
    .digest('hex');
}

function useHttpsResponses(responses) {
  const original = https.request;
  const requests = [];

  https.request = function request(options, callback) {
    const request = new EventEmitter();
    let rawBody = '';
    request.write = chunk => { rawBody += String(chunk); };
    request.setTimeout = () => request;
    request.destroy = error => request.emit('error', error);
    request.end = () => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected HTTPS request: ' + options.hostname + options.path);
      requests.push({ options, rawBody });
      const response = new EventEmitter();
      response.statusCode = next.status;
      response.resume = () => {};
      callback(response);
      process.nextTick(() => {
        if (next.data !== undefined && next.data !== null) {
          response.emit('data', JSON.stringify(next.data));
        }
        response.emit('end');
      });
    };
    return request;
  };

  return {
    requests,
    restore() {
      https.request = original;
      assert.equal(responses.length, 0, 'All mocked HTTPS responses should be consumed');
    },
  };
}

function withEventEnvironment() {
  const names = [
    'ENABLE_REAL_PAYMENTS',
    'ENABLE_EVENT_OPERATIONS',
    'EVENT_RELEASE_ID',
    'EVENT_PUBLIC_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'BOLD_API_KEY',
    'BOLD_SECRET_KEY',
    'RESEND_API_KEY',
    'RESEND_FROM',
    'PAYMENT_ALERT_TO',
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    ENABLE_REAL_PAYMENTS: 'true',
    ENABLE_EVENT_OPERATIONS: 'true',
    EVENT_RELEASE_ID: EVENT_ID,
    EVENT_PUBLIC_URL: 'https://standup.eventosjv.com',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_KEY: 'service-role-test',
    BOLD_API_KEY: 'bold-api-test',
    BOLD_SECRET_KEY: 'bold-secret-test',
    RESEND_API_KEY: 'resend-test',
    RESEND_FROM: 'entradas@example.com',
    PAYMENT_ALERT_TO: 'admin@example.com',
  });
  return () => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  };
}

test('payment creation recalculates a mixed order on the server', async () => {
  const restoreEnvironment = withEventEnvironment();
  const mock = useHttpsResponses([
    { status: 201, data: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] },
    { status: 200, data: { payload: { payment_link: 'LNK_TEST', url: 'https://checkout.bold.co/LNK_TEST' } } },
    { status: 200, data: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] },
  ]);

  try {
    const handler = require('../netlify/functions/crear-pago-bold').handler;
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        order_reference: 'ST-TEST-MIXED',
        seats: ['A-1', 'A-4', 'A-6'],
        customer: {
          name: 'Persona Prueba',
          email: 'persona@example.com',
          phone: '3000000000',
          privacyConsent: true,
          termsAccepted: true,
        },
      }),
    });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.totalAmount, 187000);

    const reservationRows = JSON.parse(mock.requests[0].rawBody);
    assert.deepEqual(reservationRows.map(row => row.amount), [49000, 59000, 79000]);
    assert.ok(reservationRows.every(row => row.privacy_policy_version === '2026-09-04'));
    assert.equal(mock.requests[0].options.path, '/rest/v1/st_event_reservations');

    const boldBody = JSON.parse(mock.requests[1].rawBody);
    assert.equal(boldBody.amount.total_amount, 187000);
    assert.equal(boldBody.reference, 'ST-TEST-MIXED');
    assert.equal(mock.requests[1].options.hostname, 'integrations.api.bold.co');
  } finally {
    mock.restore();
    restoreEnvironment();
  }
});

test('payment creation rejects missing legal consent before external calls', async () => {
  const restoreEnvironment = withEventEnvironment();
  try {
    const handler = require('../netlify/functions/crear-pago-bold').handler;
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        order_reference: 'ST-TEST-NO-CONSENT',
        seats: ['A-1'],
        customer: {
          name: 'Persona Prueba',
          email: 'persona@example.com',
          phone: '3000000000',
          privacyConsent: false,
          termsAccepted: true,
        },
      }),
    });
    assert.equal(response.statusCode, 400);
  } finally {
    restoreEnvironment();
  }
});

test('the public webhook verifies the signature and queues background work', async () => {
  const restoreEnvironment = withEventEnvironment();
  const payload = {
    id: 'evt-queue-1',
    type: 'SALE_APPROVED',
    data: {
      payment_id: 'PAY-QUEUE-1',
      amount: { currency: 'COP', total: 49000 },
      metadata: { reference: 'LNK_QUEUE' },
    },
  };
  const rawBody = JSON.stringify(payload);
  const mock = useHttpsResponses([{ status: 202 }]);

  try {
    const handler = require('../netlify/functions/bold-webhook').handler;
    const response = await handler({
      httpMethod: 'POST',
      body: rawBody,
      headers: { 'x-bold-signature': signatureFor(rawBody, process.env.BOLD_SECRET_KEY) },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(mock.requests[0].options.hostname, 'standup.eventosjv.com');
    assert.equal(mock.requests[0].options.path, '/.netlify/functions/bold-webhook-process-background');
  } finally {
    mock.restore();
    restoreEnvironment();
  }
});

test('background payment processing sends the audited amount and idempotent emails', async () => {
  const restoreEnvironment = withEventEnvironment();
  const payload = {
    id: 'evt-paid-1',
    type: 'SALE_APPROVED',
    subject: 'PAY-PAID-1',
    data: {
      payment_id: 'PAY-PAID-1',
      amount: { currency: 'COP', total: 187000 },
      metadata: { reference: 'LNK_PAID' },
    },
  };
  const rawBody = JSON.stringify(payload);
  const rows = [
    { seat_id: 'A-1', amount: 49000, qr_code: 'ST-PAID', customer_name: 'Persona Prueba', customer_email: 'persona@example.com', customer_phone: '3000000000' },
    { seat_id: 'A-4', amount: 59000, qr_code: 'ST-PAID', customer_name: 'Persona Prueba', customer_email: 'persona@example.com', customer_phone: '3000000000' },
    { seat_id: 'A-6', amount: 79000, qr_code: 'ST-PAID', customer_name: 'Persona Prueba', customer_email: 'persona@example.com', customer_phone: '3000000000' },
  ];
  const mock = useHttpsResponses([
    { status: 200, data: { status: 'paid', duplicate: false, seats: 3, expectedAmount: 187000 } },
    { status: 200, data: rows },
    { status: 200, data: { id: 'email-admin' } },
    { status: 200, data: { id: 'email-customer' } },
    { status: 200, data: [{ id: 'evt-paid-1' }] },
  ]);

  try {
    const handler = require('../netlify/functions/bold-webhook-process-background').handler;
    const response = await handler({
      httpMethod: 'POST',
      body: rawBody,
      headers: { 'x-bold-signature': signatureFor(rawBody, process.env.BOLD_SECRET_KEY) },
    });
    assert.equal(response.statusCode, 200);

    const rpcBody = JSON.parse(mock.requests[0].rawBody);
    assert.equal(rpcBody.p_event_id, EVENT_ID);
    assert.equal(rpcBody.p_amount, 187000);
    assert.equal(rpcBody.p_currency, 'COP');
    assert.equal(mock.requests[0].options.path, '/rest/v1/rpc/st_apply_bold_webhook');

    const emailRequests = mock.requests.filter(request => request.options.hostname === 'api.resend.com');
    assert.equal(emailRequests.length, 2);
    assert.ok(emailRequests.every(request =>
      request.options.headers['Idempotency-Key'].startsWith('standup-payment-PAY-PAID-1-')
    ));
    assert.match(mock.requests[4].options.path, /st_payment_webhook_events/);
  } finally {
    mock.restore();
    restoreEnvironment();
  }
});
