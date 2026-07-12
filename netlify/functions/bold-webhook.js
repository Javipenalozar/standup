// Netlify Function - Webhook de Bold
// Actualiza las reservas y notifica al organizador por Resend.

const crypto = require('crypto');
const https = require('https');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function requestJson({ method, hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ method, hostname, path, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
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
      Prefer: method === 'PATCH' || method === 'POST'
        ? 'return=representation'
        : 'return=minimal',
    },
    body,
  });
}

function verifyBoldSignature(rawBody, signature) {
  if (!process.env.BOLD_SECRET_KEY || !signature) return false;

  const bodyBase64 = Buffer.from(rawBody, 'utf8').toString('base64');
  const expected = crypto
    .createHmac('sha256', process.env.BOLD_SECRET_KEY)
    .update(bodyBase64)
    .digest('hex');

  const provided = String(signature).trim().toLowerCase();
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(provided, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

function getReference(payload) {
  const data = payload.data || payload;
  return (
    data.order_reference ||
    data.reference ||
    data.external_reference ||
    data.metadata?.reference ||
    payload.order_reference ||
    payload.reference ||
    payload.metadata?.reference ||
    null
  );
}

function getPaymentId(payload) {
  const data = payload.data || payload;
  return data.payment_id || data.id || payload.id || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function sendPaymentAlert(rows, reference, paymentId) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const first = rows[0];
  const seats = rows
    .map((row) => row.seat_id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const ticketUrl =
    'https://standup.eventosjv.com/inscribirse/?ref=' +
    encodeURIComponent(reference);

  const emailBody = {
    from: process.env.RESEND_FROM,
    to: [process.env.PAYMENT_ALERT_TO],
    subject: 'Nuevo pago confirmado - ' + first.customer_name,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
        <h2>Nuevo pago confirmado</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(first.customer_name)}</p>
        <p><strong>Correo:</strong> ${escapeHtml(first.customer_email)}</p>
        <p><strong>Telefono:</strong> ${escapeHtml(first.customer_phone)}</p>
        <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
        <p><strong>Total:</strong> $${total.toLocaleString('es-CO')} COP</p>
        <p><strong>Referencia:</strong> ${escapeHtml(reference)}</p>
        <p><a href="${ticketUrl}">Ver entrada y QR</a></p>
      </div>
    `,
  };

  return requestJson({
    method: 'POST',
    hostname: 'api.resend.com',
    path: '/emails',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Idempotency-Key': 'standup-payment-' + (paymentId || reference),
    },
    body: emailBody,
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  const signature =
    event.headers?.['x-bold-signature'] ||
    event.headers?.['X-Bold-Signature'];

  if (!verifyBoldSignature(rawBody, signature)) {
    console.warn('Rejected Bold webhook with invalid signature');
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  try {
    const payload = JSON.parse(rawBody);
    const data = payload.data || payload;
    const eventType = payload.type || payload.event || '';
    const status = data.status || payload.status || '';
    const reference = getReference(payload);
    const paymentId = getPaymentId(payload);

    if (!reference) {
      console.error('Bold webhook without payment reference', eventType);
      return jsonResponse(400, { error: 'Missing payment reference' });
    }

    const approved =
      eventType === 'SALE_APPROVED' ||
      eventType === 'PAYMENT_APPROVED' ||
      status === 'APPROVED';
    const rejected =
      eventType === 'SALE_REJECTED' ||
      eventType === 'PAYMENT_REJECTED' ||
      eventType === 'PAYMENT_ERROR' ||
      status === 'REJECTED' ||
      status === 'ERROR';

    if (!approved && !rejected) {
      return jsonResponse(200, { ok: true, ignored: eventType || status });
    }

    if (rejected) {
      await supabaseRequest(
        'DELETE',
        '/rest/v1/reservations?qr_code=eq.' +
          encodeURIComponent(reference) +
          '&payment_status=eq.pending'
      );
      return jsonResponse(200, { ok: true, status: 'cancelled' });
    }

    const update = await supabaseRequest(
      'PATCH',
      '/rest/v1/reservations?qr_code=eq.' +
        encodeURIComponent(reference) +
        '&payment_status=eq.pending&select=*',
      { payment_status: 'paid' }
    );

    if (update.status >= 400) {
      console.error('Supabase update failed', update.status, update.data);
      return jsonResponse(500, { error: 'Could not update reservations' });
    }

    const updatedRows = Array.isArray(update.data) ? update.data : [];
    if (updatedRows.length === 0) {
      return jsonResponse(200, {
        ok: true,
        status: 'paid',
        duplicate: true,
      });
    }

    let notification = 'sent';
    try {
      const email = await sendPaymentAlert(updatedRows, reference, paymentId);
      if (email.status < 200 || email.status >= 300) {
        notification = 'failed';
        console.error('Resend alert failed', email.status, email.data);
      }
    } catch (error) {
      notification = 'failed';
      console.error('Resend alert error', error);
    }

    return jsonResponse(200, {
      ok: true,
      status: 'paid',
      seats: updatedRows.length,
      notification,
    });
  } catch (error) {
    console.error('Webhook error', error);
    return jsonResponse(500, { error: 'Internal error' });
  }
};
