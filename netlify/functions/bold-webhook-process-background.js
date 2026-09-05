'use strict';

const crypto = require('crypto');
const https = require('https');
const { EVENT, eventDetailsHtml, publicUrl, realPaymentsEnabled } = require('../lib/event-config');

function requestJson({ method, hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? '' : JSON.stringify(body);
    const req = https.request({
      method,
      hostname,
      path,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function supabaseRequest(method, path, body) {
  const url = new URL(path, process.env.SUPABASE_URL);
  return requestJson({
    method,
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      Prefer: method === 'GET' ? 'return=minimal' : 'return=representation',
    },
    body,
  });
}

function verifyBoldSignature(rawBody, signature, secret = process.env.BOLD_SECRET_KEY) {
  if (!secret || !signature) return false;
  const bodyBase64 = Buffer.from(rawBody, 'utf8').toString('base64');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(bodyBase64)
    .digest('hex');
  const provided = String(signature).trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function eventFields(payload, rawBody) {
  const data = payload.data || payload;
  const amount = Number(data.amount?.total);
  return {
    providerEventId: String(
      payload.id || crypto.createHash('sha256').update(rawBody).digest('hex')
    ),
    eventType: String(payload.type || payload.event || data.status || '').toUpperCase(),
    reference: String(
      data.metadata?.reference ||
      payload.metadata?.reference ||
      data.order_reference ||
      data.reference ||
      data.external_reference ||
      payload.order_reference ||
      payload.reference ||
      ''
    ),
    paymentId: String(data.payment_id || payload.subject || data.id || ''),
    amount: Number.isSafeInteger(amount) ? amount : null,
    currency: String(data.amount?.currency || '').toUpperCase(),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadReservationRows(reference) {
  const base = '/rest/v1/st_event_reservations?event_id=eq.' + encodeURIComponent(EVENT.id) +
    '&payment_status=eq.paid&select=*';
  let result = await supabaseRequest(
    'GET',
    base + '&bold_reference=eq.' + encodeURIComponent(reference),
    null
  );
  if (result.status < 400 && Array.isArray(result.data) && result.data.length === 0) {
    result = await supabaseRequest(
      'GET',
      base + '&qr_code=eq.' + encodeURIComponent(reference),
      null
    );
  }
  if (result.status >= 400 || !Array.isArray(result.data)) {
    throw new Error('Could not load paid reservation rows');
  }
  return result.data;
}

async function sendEmail({ to, subject, html, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    throw new Error('Resend is not configured');
  }
  return requestJson({
    method: 'POST',
    hostname: 'api.resend.com',
    path: '/emails',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'standup-therapy/2.0',
    },
    body: {
      from: process.env.RESEND_FROM,
      to: [to],
      reply_to: process.env.RESEND_REPLY_TO || undefined,
      subject,
      html,
    },
  });
}

async function sendPaymentNotifications(rows, reference, paymentId) {
  if (!process.env.PAYMENT_ALERT_TO) throw new Error('PAYMENT_ALERT_TO is not configured');
  const first = rows[0];
  const seats = rows
    .map(row => row.seat_id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const ticketUrl = publicUrl('/inscribirse/', { ref: first.qr_code });
  const idempotencyBase = 'standup-payment-' + (paymentId || reference);

  const messages = await Promise.all([
    sendEmail({
      to: process.env.PAYMENT_ALERT_TO,
      subject: 'Nuevo pago confirmado - ' + first.customer_name,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
          <h2>Nuevo pago confirmado</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(first.customer_name)}</p>
          <p><strong>Correo:</strong> ${escapeHtml(first.customer_email)}</p>
          <p><strong>Teléfono:</strong> ${escapeHtml(first.customer_phone)}</p>
          <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
          <p><strong>Total:</strong> $${total.toLocaleString('es-CO')} COP</p>
          <p><strong>Transacción Bold:</strong> ${escapeHtml(paymentId)}</p>
          <p><a href="${ticketUrl}">Ver entrada y QR</a></p>
        </div>`,
      idempotencyKey: idempotencyBase + '-admin',
    }),
    sendEmail({
      to: first.customer_email,
      subject: 'Tus entradas para ' + EVENT.name,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
          <h2>Tu reserva está confirmada</h2>
          <p>Hola ${escapeHtml(first.customer_name)},</p>
          <p>Bold confirmó tu pago para ${EVENT.name}.</p>
          ${eventDetailsHtml()}
          <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
          <p><strong>Total:</strong> $${total.toLocaleString('es-CO')} COP</p>
          <p><a href="${ticketUrl}" style="display:inline-block;padding:12px 18px;background:#050608;color:#fff;text-decoration:none">Ver entrada y código QR</a></p>
        </div>`,
      idempotencyKey: idempotencyBase + '-customer',
    }),
  ]);

  const failed = messages.find(message => message.status < 200 || message.status >= 300);
  if (failed) throw new Error('Resend returned HTTP ' + failed.status);
}

async function updateNotification(providerEventId, status, errorMessage = null) {
  const result = await supabaseRequest(
    'PATCH',
    '/rest/v1/st_payment_webhook_events?provider_event_id=eq.' +
      encodeURIComponent(providerEventId),
    {
      notification_status: status,
      notification_error: errorMessage,
    }
  );
  if (result.status >= 400) {
    console.error('Could not update notification audit', result.status, result.data);
  }
}

exports.handler = async function handler(event) {
  if (!realPaymentsEnabled()) {
    return { statusCode: 503, body: 'Payments disabled' };
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  const signature =
    event.headers?.['x-bold-signature'] ||
    event.headers?.['X-Bold-Signature'];

  if (!verifyBoldSignature(rawBody, signature)) {
    console.warn('Rejected background webhook with invalid signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let fields;
  try {
    const payload = JSON.parse(rawBody);
    fields = eventFields(payload, rawBody);
    const result = await supabaseRequest(
      'POST',
      '/rest/v1/rpc/st_apply_bold_webhook',
      {
        p_provider_event_id: fields.providerEventId,
        p_event_id: EVENT.id,
        p_event_type: fields.eventType,
        p_payment_reference: fields.reference,
        p_payment_id: fields.paymentId,
        p_amount: fields.amount,
        p_currency: fields.currency,
        p_payload: payload,
      }
    );

    if (result.status >= 400 || !result.data || typeof result.data !== 'object') {
      throw new Error('Webhook RPC failed with HTTP ' + result.status);
    }
    if (result.data.status === 'error') {
      throw new Error('Webhook RPC returned an audited error');
    }

    if (result.data.status === 'paid') {
      const rows = await loadReservationRows(fields.reference);
      if (rows.length === 0) throw new Error('Paid webhook returned no reservation rows');
      try {
        await sendPaymentNotifications(rows, fields.reference, fields.paymentId);
        await updateNotification(fields.providerEventId, 'sent');
      } catch (emailError) {
        await updateNotification(fields.providerEventId, 'failed', String(emailError.message || emailError));
        throw emailError;
      }
    }

    if (['amount_mismatch', 'unmatched', 'invalid_reference'].includes(result.data.status)) {
      console.error('Bold webhook requires manual review', fields, result.data);
    }

    return { statusCode: 200, body: JSON.stringify(result.data) };
  } catch (error) {
    console.error('Background webhook failed', fields || {}, error);
    return { statusCode: 500, body: 'Processing failed' };
  }
};

exports._test = { verifyBoldSignature, eventFields };
