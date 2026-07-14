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
    data.metadata?.reference ||
    payload.metadata?.reference ||
    data.order_reference ||
    data.reference ||
    data.external_reference ||
    payload.order_reference ||
    payload.reference ||
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

async function sendEmail({ to, subject, html, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  return requestJson({
    method: 'POST',
    hostname: 'api.resend.com',
    path: '/emails',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'standup-therapy/1.0',
    },
    body: {
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      html,
    },
  });
}

async function sendPaymentNotifications(rows, boldReference, paymentId) {
  if (!process.env.PAYMENT_ALERT_TO || !process.env.RESEND_FROM) {
    throw new Error('Resend sender or recipient is not configured');
  }

  const first = rows[0];
  const seats = rows
    .map((row) => row.seat_id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const ticketReference = first.qr_code;
  const ticketUrl =
    'https://standup.eventosjv.com/inscribirse/?ref=' +
    encodeURIComponent(ticketReference);
  const idempotencyBase = 'standup-payment-' + (paymentId || boldReference);

  const adminEmail = await sendEmail({
    to: process.env.PAYMENT_ALERT_TO,
    subject: 'Nuevo pago confirmado - ' + first.customer_name,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
        <h2>Nuevo pago confirmado</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(first.customer_name)}</p>
        <p><strong>Correo:</strong> ${escapeHtml(first.customer_email)}</p>
        <p><strong>Tel&eacute;fono:</strong> ${escapeHtml(first.customer_phone)}</p>
        <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
        <p><strong>Total:</strong> $${total.toLocaleString('es-CO')} COP</p>
        <p><strong>Referencia de entrada:</strong> ${escapeHtml(ticketReference)}</p>
        <p><strong>Referencia Bold:</strong> ${escapeHtml(boldReference)}</p>
        <p><a href="${ticketUrl}">Ver entrada y QR</a></p>
      </div>
    `,
    idempotencyKey: idempotencyBase + '-admin',
  });

  const customerEmail = await sendEmail({
    to: first.customer_email,
    subject: 'Tus entradas para Stand-Up Therapy',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
        <h2>Tu reserva est&aacute; confirmada</h2>
        <p>Hola ${escapeHtml(first.customer_name)},</p>
        <p>Tu pago para Stand-Up Therapy fue confirmado.</p>
        <p><strong>Fecha:</strong> 2 de septiembre de 2026, 6:00 p. m.</p>
        <p><strong>Lugar:</strong> Teatro Belarte, Cra. 7 # 152-54, Bogot&aacute;</p>
        <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
        <p><strong>Total:</strong> $${total.toLocaleString('es-CO')} COP</p>
        <p><a href="${ticketUrl}" style="display:inline-block;padding:12px 18px;background:#050608;color:#fff;text-decoration:none">Ver entrada y c&oacute;digo QR</a></p>
        <p>Presenta el c&oacute;digo QR en la entrada del teatro.</p>
      </div>
    `,
    idempotencyKey: idempotencyBase + '-customer',
  });

  return { adminEmail, customerEmail };
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
      console.info('Ignored Bold webhook event', eventType || status);
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

    let update = await supabaseRequest(
      'PATCH',
      '/rest/v1/reservations?bold_reference=eq.' +
        encodeURIComponent(reference) +
        '&payment_status=eq.pending&select=*',
      { payment_status: 'paid' }
    );

    if (update.status < 400 && Array.isArray(update.data) && update.data.length === 0) {
      update = await supabaseRequest(
        'PATCH',
        '/rest/v1/reservations?qr_code=eq.' +
          encodeURIComponent(reference) +
          '&payment_status=eq.pending&select=*',
        { payment_status: 'paid' }
      );
    }

    if (update.status >= 400) {
      console.error('Supabase update failed', update.status, update.data);
      return jsonResponse(500, { error: 'Could not update reservations' });
    }

    let notificationRows = Array.isArray(update.data) ? update.data : [];
    let duplicate = false;

    if (notificationRows.length === 0) {
      duplicate = true;
      let existing = await supabaseRequest(
        'GET',
        '/rest/v1/reservations?bold_reference=eq.' +
          encodeURIComponent(reference) +
          '&payment_status=eq.paid&select=*',
        null
      );

      if (existing.status < 400 && Array.isArray(existing.data) && existing.data.length === 0) {
        existing = await supabaseRequest(
          'GET',
          '/rest/v1/reservations?qr_code=eq.' +
            encodeURIComponent(reference) +
            '&payment_status=eq.paid&select=*',
          null
        );
      }

      if (existing.status >= 400) {
        console.error('Supabase lookup failed', existing.status, existing.data);
        return jsonResponse(500, { error: 'Could not read reservations' });
      }

      notificationRows = Array.isArray(existing.data) ? existing.data : [];
      if (notificationRows.length === 0) {
        console.warn('Bold webhook reference did not match reservations', reference);
        return jsonResponse(200, {
          ok: true,
          status: 'unmatched',
        });
      }
    }

    let notification = 'sent';
    try {
      const emails = await sendPaymentNotifications(notificationRows, reference, paymentId);
      const failed = [emails.adminEmail, emails.customerEmail]
        .find((email) => email.status < 200 || email.status >= 300);
      if (failed) {
        notification = 'failed';
        console.error('Resend notification failed', failed.status, failed.data);
      }
    } catch (error) {
      notification = 'failed';
      console.error('Resend alert error', error);
    }

    return jsonResponse(200, {
      ok: true,
      status: 'paid',
      seats: notificationRows.length,
      duplicate,
      notification,
    });
  } catch (error) {
    console.error('Webhook error', error);
    return jsonResponse(500, { error: 'Internal error' });
  }
};
