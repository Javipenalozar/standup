const https = require('https');
const { EVENT, eventDetailsHtml, eventOperationsEnabled, publicUrl } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

const EVENT_ID = EVENT.id;

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

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }
  if (!eventOperationsEnabled()) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Las operaciones del evento permanecen bloqueadas' }),
    };
  }

  try {
    const { qrCode } = JSON.parse(event.body || '{}');
    if (!adminAuth.isAuthorizedEvent(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión administrativa vencida' }) };
    }
    if (!qrCode) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el código QR' }) };
    }

    const supabaseUrl = new URL(
      '/rest/v1/st_event_reservations?select=customer_name,customer_email,seat_id,payment_status' +
      '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&qr_code=eq.' + encodeURIComponent(qrCode) +
      '&order=seat_id.asc',
      process.env.SUPABASE_URL
    );
    const reservationResult = await requestJson({
      method: 'GET',
      hostname: supabaseUrl.hostname,
      path: supabaseUrl.pathname + supabaseUrl.search,
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      },
    });
    const rows = reservationResult.data;

    if (reservationResult.status >= 400 || !Array.isArray(rows)) {
      console.error('Could not load ticket', reservationResult.status, reservationResult.data);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No fue posible consultar la entrada' }) };
    }
    if (rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Entrada no encontrada' }) };
    }
    if (rows.some(row => row.payment_status !== 'paid')) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'La entrada todavía no está pagada' }) };
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'El correo no está configurado' }) };
    }

    const name = rows[0].customer_name;
    const email = rows[0].customer_email;
    const seats = rows.map(row => row.seat_id).sort(sortSeats);
    const ticketUrl = publicUrl('/inscribirse/', { ref: qrCode });
    const emailResult = await requestJson({
      method: 'POST',
      hostname: 'api.resend.com',
      path: '/emails',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Idempotency-Key':
          'standup-ticket-resend-' + qrCode + '-' + new Date().toISOString().slice(0, 10),
        'User-Agent': 'standup-therapy/1.0',
      },
      body: {
        from: process.env.RESEND_FROM,
        to: [email],
        reply_to: process.env.RESEND_REPLY_TO || undefined,
        subject: 'Tu entrada para ' + EVENT.name,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
            <h2>Tu entrada está confirmada</h2>
            <p>Hola ${escapeHtml(name)},</p>
            <p>Te reenviamos la entrada para ${EVENT.name}.</p>
            ${eventDetailsHtml()}
            <p><strong>Sillas:</strong> ${escapeHtml(seats.join(', '))}</p>
            <p>
              <a href="${ticketUrl}" style="display:inline-block;padding:12px 18px;background:#050608;color:#fff;text-decoration:none">
                Ver entrada y código QR
              </a>
            </p>
            <p><strong>Código:</strong> ${escapeHtml(qrCode)}</p>
            <p>Presenta el código QR en la entrada del teatro.</p>
          </div>
        `,
      },
    });

    if (emailResult.status < 200 || emailResult.status >= 300) {
      console.error('Resend error', emailResult.status, emailResult.data);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Resend rechazó el correo' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: true, email, seats }),
    };
  } catch (error) {
    console.error('Ticket resend error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno' }) };
  }
};
