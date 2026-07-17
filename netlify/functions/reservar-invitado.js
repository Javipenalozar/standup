// Netlify Function — Reservar sillas para invitado (sin pago)
// POST /.netlify/functions/reservar-invitado
// Body: { code, seats: ["A-10","A-11"], name, email, phone }

const https = require('https');

function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, process.env.SUPABASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
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

function sendEmail({ to, subject, html, idempotencyKey }) {
  return new Promise((resolve, reject) => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      resolve({ status: 0, data: 'Resend is not configured' });
      return;
    }

    const body = JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      reply_to: process.env.RESEND_REPLY_TO || undefined,
      subject,
      html,
    });
    const req = https.request({
      method: 'POST',
      hostname: 'api.resend.com',
      path: '/emails',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'standup-therapy/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendInvitationNotifications({ name, email, phone, seats, orderRef, company }) {
  const ticketUrl = 'https://standup.eventosjv.com/inscribirse/?ref=' + encodeURIComponent(orderRef);
  const companyText = company ? ' obsequiada por ' + escapeHtml(company) : '';
  const customer = await sendEmail({
    to: email,
    subject: 'Tu entrada para Stand-Up Therapy',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
        <h2>Tu entrada est&aacute; confirmada</h2>
        <p>Hola ${escapeHtml(name)},</p>
        <p>Tu entrada${companyText} ya est&aacute; registrada.</p>
        <p><strong>Fecha:</strong> 2 de septiembre de 2026, 6:00 p. m.</p>
        <p><strong>Lugar:</strong> Teatro Belarte, Cra. 7 # 152-54, Bogot&aacute;</p>
        <p><strong>Silla:</strong> ${escapeHtml(seats.join(', '))}</p>
        <p><a href="${ticketUrl}" style="display:inline-block;padding:12px 18px;background:#050608;color:#fff;text-decoration:none">Ver entrada y c&oacute;digo QR</a></p>
        <p>Presenta el c&oacute;digo QR en la entrada del teatro.</p>
      </div>
    `,
    idempotencyKey: 'standup-invitation-' + orderRef + '-customer',
  });

  let admin = { status: 200 };
  if (process.env.PAYMENT_ALERT_TO) {
    admin = await sendEmail({
      to: process.env.PAYMENT_ALERT_TO,
      subject: 'Nueva entrada registrada' + (company ? ' - ' + company : ''),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
          <h2>Nueva entrada registrada</h2>
          ${company ? '<p><strong>Empresa:</strong> ' + escapeHtml(company) + '</p>' : ''}
          <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
          <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
          <p><strong>Tel&eacute;fono:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Silla:</strong> ${escapeHtml(seats.join(', '))}</p>
          <p><a href="${ticketUrl}">Ver entrada y QR</a></p>
        </div>
      `,
      idempotencyKey: 'standup-invitation-' + orderRef + '-admin',
    });
  }

  return customer.status >= 200 && customer.status < 300 &&
    admin.status >= 200 && admin.status < 300;
}

function corporateError(data) {
  const message = typeof data === 'object' && data ? data.message : '';
  if (message.includes('correo')) return message;
  if (message.includes('cupos')) return message;
  if (message.includes('silla')) return message;
  return 'No fue posible registrar la entrada empresarial';
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"POST only"}' };

  try {
    const { code, seats, name, email, phone } = JSON.parse(event.body);

    if (!code || !seats || !seats.length || !name || !email) {
      return { statusCode: 400, headers, body: '{"error":"Datos incompletos"}' };
    }

    // Validar invitación
    const invResult = await supabaseRequest('GET',
      '/rest/v1/invitations?code=eq.' + encodeURIComponent(code) + '&select=*&limit=1'
    );

    // GET returns array directly, not wrapped
    let inv;
    if (Array.isArray(invResult.data)) {
      inv = invResult.data[0];
    }

    if (!inv) {
      return { statusCode: 404, headers, body: '{"error":"Código no válido"}' };
    }
    if (inv.used && !inv.multi_use) {
      return { statusCode: 410, headers, body: '{"error":"Código ya utilizado"}' };
    }
    if (seats.length > inv.max_seats) {
      return { statusCode: 400, headers, body: '{"error":"Máximo ' + inv.max_seats + ' silla(s)"}' };
    }

    const orderRef = 'INV-' + code + '-' + Date.now().toString(36).toUpperCase();
    const EVENT_ID = 'standup-therapy-bogota-2sep2026';
    let remainingSeats = null;

    if (inv.total_quota) {
      const corporateResult = await supabaseRequest(
        'POST',
        '/rest/v1/rpc/reserve_corporate_invitation',
        {
          p_code: code,
          p_event_id: EVENT_ID,
          p_seats: seats,
          p_name: name,
          p_email: email,
          p_phone: phone || '',
          p_order_ref: orderRef,
        }
      );

      if (corporateResult.status >= 400) {
        console.error('Corporate reservation error:', corporateResult.data);
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: corporateError(corporateResult.data) }),
        };
      }
      remainingSeats = corporateResult.data?.remaining ?? null;
    } else {
      // Crear reservas como pagadas directamente
      const reservations = seats.map(seatId => ({
        event_id: EVENT_ID,
        seat_id: seatId,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || '',
        payment_status: 'paid',
        qr_code: orderRef,
        amount: 0,
        invitation_code: code,
      }));

      const insertResult = await supabaseRequest('POST', '/rest/v1/reservations', reservations);

      if (insertResult.status >= 400) {
        console.error('Insert error:', insertResult.data);
        return { statusCode: 409, headers, body: '{"error":"Algunas sillas ya están ocupadas"}' };
      }

      // Marcar invitación como usada (solo si no es multi_use)
      if (!inv.multi_use) {
        await supabaseRequest('PATCH',
          '/rest/v1/invitations?code=eq.' + encodeURIComponent(code),
          { used: true }
        );
      }
    }

    let emailSent = false;
    try {
      emailSent = await sendInvitationNotifications({
        name,
        email,
        phone: phone || '',
        seats,
        orderRef,
        company: inv.total_quota ? inv.guest_name : '',
      });
    } catch (emailError) {
      console.error('Invitation email error:', emailError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        orderRef,
        seats,
        name,
        email,
        emailSent,
        remainingSeats,
      }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: '{"error":"Error interno"}' };
  }
};
