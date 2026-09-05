const https = require('https');
const { EVENT, eventDetailsText, eventOperationsEnabled, publicUrl } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

const TEST_RECIPIENT = 'jvbienestarysaludmental@javipenaloza.com';
const SAMPLE_QR = 'VISTA-PREVIA-DEJA-DE-JODER-2026';

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

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });
  if (!eventOperationsEnabled()) {
    return response(503, { error: 'Las operaciones del evento permanecen bloqueadas' });
  }

  try {
    if (!adminAuth.isAuthorizedEvent(event)) {
      return response(401, { error: 'Sesión administrativa vencida' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return response(500, { error: 'Resend no está configurado' });
    }

    const ticketUrl = publicUrl('/inscribirse/', { ref: SAMPLE_QR });
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
            <p style="margin-top:0;">Hola, <strong>Javi</strong>:</p>
            <p>Estamos muy cerca de vivir ${EVENT.name}.</p>
            <p>Gracias por reservar tu entrada para esta noche de comedia en vivo.</p>
            <div style="margin:24px 0;padding:18px 20px;background:#f5f7f9;border-left:4px solid #f9b609;">
              <div><strong>Fecha:</strong> ${EVENT.date}</div>
              <div><strong>Inicio:</strong> ${EVENT.time}</div>
              <div><strong>Lugar:</strong> ${EVENT.venue}</div>
              <div><strong>Dirección:</strong> ${EVENT.address}</div>
            </div>
            <h2 style="font-size:20px;margin:28px 0 12px;">Tus entradas confirmadas</h2>
            <div style="padding:18px;border:1px solid #dbe1e7;background:#fff;">
              <div><strong>Sillas:</strong> K-6 a K-15</div>
              <div style="margin-top:5px;color:#59636f;font-size:13px;">Código: ${SAMPLE_QR}</div>
              <a href="${ticketUrl}" style="display:inline-block;margin-top:15px;padding:12px 18px;background:#080a0d;color:#fff;text-decoration:none;font-weight:700;">Ver entrada y código QR</a>
            </div>
            <p style="margin-top:24px;">Ten disponible en tu celular el código QR de tu entrada.</p>
            <p>Nos vemos muy pronto.</p>
            <p style="margin-bottom:0;"><strong>Javi Peñaloza</strong><br>Stand-Up Therapy<br>WhatsApp: +57 323 801 6527</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
    const text = [
      'Hola, Javi:',
      '',
      `Estamos muy cerca de vivir ${EVENT.name}.`,
      '',
      ...eventDetailsText(),
      '',
      'Tus entradas confirmadas',
      'Sillas: K-6 a K-15',
      `Ver entrada y código QR: ${ticketUrl}`,
      '',
      'Javi Peñaloza',
      'Stand-Up Therapy',
      'WhatsApp: +57 323 801 6527',
    ].join('\n');
    const emailResult = await requestJson({
      method: 'POST',
      hostname: 'api.resend.com',
      path: '/emails',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Idempotency-Key': 'standup-reminder-preview-deja-de-joder-2026-v1',
        'User-Agent': 'standup-therapy/1.0',
      },
      body: {
        from: process.env.RESEND_FROM,
        to: [TEST_RECIPIENT],
        reply_to: process.env.RESEND_REPLY_TO || TEST_RECIPIENT,
        subject: 'PRUEBA · Información para ' + EVENT.name,
        html,
        text,
        tags: [
          { name: 'campaign', value: 'standup_reminder_preview' },
          { name: 'event', value: 'deja_de_joder_2026' },
        ],
      },
    });

    if (emailResult.status < 200 || emailResult.status >= 300) {
      console.error('Resend preview error', emailResult.status, emailResult.data);
      return response(502, {
        error: 'Resend rechazó la vista previa',
        status: emailResult.status,
      });
    }

    return response(200, {
      sent: true,
      email: TEST_RECIPIENT,
      resendId: emailResult.data.id,
    });
  } catch (error) {
    console.error('Reminder preview error', error);
    return response(500, { error: 'Error interno en la vista previa' });
  }
};
