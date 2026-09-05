const crypto = require('crypto');
const https = require('https');
const { EVENT, eventDetailsText, eventOperationsEnabled, publicUrl } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

const EVENT_ID = EVENT.id;
const EMAIL_CORRECTIONS = new Map();

function requestJson({ method, hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
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

function requestBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Bono HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function validEmail(value) {
  const email = String(value || '').trim();
  const parts = email.split('@');
  return parts.length === 2 && parts[0] && parts[1].includes('.') && !email.includes(' ');
}

function normalizeEmail(row) {
  let email = String(row.customer_email || '').trim().toLowerCase();
  const phone = String(row.customer_phone || '').trim().toLowerCase();
  if (!validEmail(email) && validEmail(phone)) email = phone;
  return EMAIL_CORRECTIONS.get(email) || email;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sortSeats(a, b) {
  const [rowA, numberA] = a.split('-');
  const [rowB, numberB] = b.split('-');
  return rowA === rowB
    ? Number(numberA) - Number(numberB)
    : rowA.localeCompare(rowB);
}

function recipientKey(email) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 20);
}

async function loadRecipients() {
  const url = new URL(
    '/rest/v1/st_event_reservations?select=customer_name,customer_email,customer_phone,seat_id,qr_code' +
      '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&payment_status=eq.paid&order=created_at.asc',
    process.env.SUPABASE_URL
  );
  const result = await requestJson({
    method: 'GET',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
    },
  });
  if (result.status >= 400 || !Array.isArray(result.data)) {
    throw new Error(`Supabase HTTP ${result.status}`);
  }

  const recipients = new Map();
  const excluded = [];
  for (const row of result.data) {
    const email = normalizeEmail(row);
    if (!validEmail(email) || !row.qr_code) {
      excluded.push({ seat: row.seat_id, reason: !validEmail(email) ? 'email' : 'qr' });
      continue;
    }
    if (!recipients.has(email)) {
      recipients.set(email, {
        key: recipientKey(email),
        email,
        name: row.customer_name || 'Hola',
        qrGroups: new Map(),
      });
    }
    const recipient = recipients.get(email);
    if (!recipient.qrGroups.has(row.qr_code)) {
      recipient.qrGroups.set(row.qr_code, []);
    }
    recipient.qrGroups.get(row.qr_code).push(row.seat_id);
  }

  const normalized = [...recipients.values()].map(recipient => ({
    ...recipient,
    qrGroups: [...recipient.qrGroups.entries()].map(([qrCode, seats]) => ({
      qrCode,
      seats: [...new Set(seats)].sort(sortSeats),
    })),
  })).sort((a, b) => a.email.localeCompare(b.email));

  return { recipients: normalized, excluded, paidRows: result.data.length };
}

function buildMessage(recipient) {
  const ticketBlocks = recipient.qrGroups.map(({ qrCode, seats }, index) => {
    const ticketUrl = publicUrl('/inscribirse/', { ref: qrCode });
    return `
      <div style="margin-top:${index ? '14px' : '0'};padding:18px;border:1px solid #dbe1e7;background:#fff;">
        <div><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</div>
        <div style="margin-top:5px;color:#59636f;font-size:13px;">Código: ${escapeHtml(qrCode)}</div>
        <a href="${ticketUrl}" style="display:inline-block;margin-top:15px;padding:12px 18px;background:#080a0d;color:#fff;text-decoration:none;font-weight:700;">Ver entrada y código QR</a>
      </div>`;
  }).join('');
  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f2f4f7;font-family:Arial,sans-serif;color:#171a1f;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Información y entradas confirmadas para ${EVENT.name}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f7;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e3e7ec;">
          <tr><td style="padding:26px 30px;background:#080a0d;color:#fff;">
            <div style="font-size:12px;letter-spacing:1.4px;color:#f9b609;font-weight:700;">STAND-UP THERAPY</div>
            <h1 style="margin:8px 0 0;font-size:27px;line-height:1.2;">Nos vemos en ${EVENT.name}</h1>
          </td></tr>
          <tr><td style="padding:28px 30px;line-height:1.6;">
            <p style="margin-top:0;">Hola, <strong>${escapeHtml(recipient.name)}</strong>:</p>
            <p>Estamos muy cerca de vivir ${EVENT.name}.</p>
            <p>Gracias por reservar tu entrada para esta noche de comedia en vivo.</p>
            <div style="margin:24px 0;padding:18px 20px;background:#f5f7f9;border-left:4px solid #f9b609;">
              <div><strong>Fecha:</strong> ${EVENT.date}</div>
              <div><strong>Inicio:</strong> ${EVENT.time}</div>
              <div><strong>Lugar:</strong> ${EVENT.venue}</div>
              <div><strong>Dirección:</strong> ${EVENT.address}</div>
            </div>
            <h2 style="font-size:20px;margin:28px 0 12px;">Tus entradas confirmadas</h2>
            ${ticketBlocks}
            <p style="margin-top:24px;">Ten disponibles en tu celular los códigos QR de tus entradas.</p>
            <p>Nos vemos muy pronto.</p>
            <p style="margin-bottom:0;"><strong>Javi Peñaloza</strong><br>Stand-Up Therapy<br>WhatsApp: +57 323 801 6527</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const textTickets = recipient.qrGroups.flatMap(({ qrCode, seats }) => [
    `Sillas: ${seats.join(', ')}`,
    'Ver entrada y código QR: ' + publicUrl('/inscribirse/', { ref: qrCode }),
    '',
  ]);
  const text = [
    `Hola, ${recipient.name}:`,
    '',
    `Estamos muy cerca de vivir ${EVENT.name}.`,
    '',
    ...eventDetailsText(),
    '',
    'Tus entradas confirmadas',
    ...textTickets,
    'Javi Peñaloza',
    'Stand-Up Therapy',
    'WhatsApp: +57 323 801 6527',
  ].join('\n');
  return { html, text };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });
  if (!eventOperationsEnabled()) {
    return response(503, { error: 'Las operaciones del evento permanecen bloqueadas' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    if (!adminAuth.isAuthorizedEvent(event)) {
      return response(401, { error: 'Sesión administrativa vencida' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return response(500, { error: 'Resend no está configurado' });
    }

    const { recipients, excluded, paidRows } = await loadRecipients();
    if (body.action === 'preflight') {
      return response(200, {
        paidRows,
        recipientCount: recipients.length,
        qrGroupCount: recipients.reduce((sum, item) => sum + item.qrGroups.length, 0),
        excluded,
        recipients: recipients.map(item => ({
          key: item.key,
          email: item.email,
          name: item.name,
          seats: item.qrGroups.reduce((sum, group) => sum + group.seats.length, 0),
          qrGroups: item.qrGroups.length,
        })),
      });
    }
    if (body.action !== 'send' || !body.recipientKey) {
      return response(400, { error: 'Acción incompleta' });
    }

    const recipient = recipients.find(item => item.key === body.recipientKey);
    if (!recipient) return response(404, { error: 'Destinatario no encontrado' });

    const message = buildMessage(recipient);
    const emailResult = await requestJson({
      method: 'POST',
      hostname: 'api.resend.com',
      path: '/emails',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Idempotency-Key': `standup-reminder-deja-de-joder-2026-${recipient.key}-v1`,
        'User-Agent': 'standup-therapy/1.0',
      },
      body: {
        from: process.env.RESEND_FROM,
        to: [recipient.email],
        reply_to: process.env.RESEND_REPLY_TO || undefined,
        subject: 'Información para ' + EVENT.name,
        html: message.html,
        text: message.text,
        tags: [
          { name: 'campaign', value: 'standup_reminder_deja_de_joder_2026' },
          { name: 'event', value: 'deja_de_joder_2026' },
        ],
      },
    });

    if (emailResult.status < 200 || emailResult.status >= 300) {
      console.error('Resend campaign error', recipient.key, emailResult.status, emailResult.data);
      return response(502, {
        sent: false,
        key: recipient.key,
        status: emailResult.status,
        error: 'Resend rechazó el correo',
      });
    }

    return response(200, {
      sent: true,
      key: recipient.key,
      email: recipient.email,
      resendId: emailResult.data.id,
    });
  } catch (error) {
    console.error('Reminder campaign error', error);
    return response(500, { error: 'Error interno en la campaña' });
  }
};
