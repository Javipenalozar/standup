const https = require('https');
const seatPricing = require('../../seat-pricing');
const { EVENT, LEGAL, eventDetailsHtml, eventOperationsEnabled, publicUrl } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

function requestJson({ method, hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
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

function sendTicketEmail(ticket) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return Promise.resolve({ sent: false, error: 'Correo del evento no está configurado' });
  }

  const ticketUrl = publicUrl('/inscribirse/', { ref: ticket.qr_code });
  return requestJson({
    method: 'POST',
    hostname: 'api.resend.com',
    path: '/emails',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Idempotency-Key': 'standup-manual-transfer-ticket-' + ticket.qr_code,
      'User-Agent': 'standup-therapy/1.0',
    },
    body: {
      from: process.env.RESEND_FROM,
      to: [ticket.customer_email],
      reply_to: process.env.RESEND_REPLY_TO || undefined,
      subject: 'Tu entrada para ' + EVENT.name,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
          <h2>Tu entrada está confirmada</h2>
          <p>Hola ${escapeHtml(ticket.customer_name)},</p>
          <p>Registramos tu transferencia y tu entrada para ${EVENT.name}.</p>
          ${eventDetailsHtml()}
          <p><strong>Silla:</strong> ${escapeHtml(ticket.seat_id)}</p>
          <p><a href="${ticketUrl}" style="display:inline-block;padding:12px 18px;background:#050608;color:#fff;text-decoration:none">Ver entrada y código QR</a></p>
          <p><strong>Código:</strong> ${escapeHtml(ticket.qr_code)}</p>
          <p>Presenta este código QR en la entrada del teatro.</p>
        </div>
      `,
    },
  }).then(result => ({
    sent: result.status >= 200 && result.status < 300,
    error: result.status >= 200 && result.status < 300 ? null : 'Resend no aceptó el correo',
  }));
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
  if (event.httpMethod !== 'POST') return response(405, { error: 'Solo se permite POST' });
  if (!eventOperationsEnabled()) {
    return response(503, { error: 'Las operaciones del evento permanecen bloqueadas' });
  }

  if (!adminAuth.isAuthorizedEvent(event)) {
    return response(401, { error: 'Sesión administrativa vencida' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const paymentReference = String(body.paymentReference || '').trim().toUpperCase();
    const operatorName = String(body.operatorName || '').trim();
    const receivedAt = Date.parse(body.receivedAt);
    const amount = Number(body.amount);
    const attendeesInput = body.attendees;

    if (body.paymentVerified !== true) {
      return response(400, { error: 'Confirma que verificaste el ingreso del dinero en la cuenta de la empresa' });
    }
    if (paymentReference.length < 4 || paymentReference.length > 100) {
      return response(400, { error: 'Escribe la referencia del comprobante' });
    }
    if (!Number.isFinite(receivedAt) || receivedAt > Date.now() + 15 * 60 * 1000 || receivedAt < Date.now() - 365 * 24 * 60 * 60 * 1000) {
      return response(400, { error: 'Revisa la fecha y hora de la transferencia' });
    }
    if (operatorName.length < 2 || operatorName.length > 120) {
      return response(400, { error: 'Escribe quién está registrando la transferencia' });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) {
      return response(400, { error: 'El valor del comprobante no es válido' });
    }
    if (!Array.isArray(attendeesInput) || attendeesInput.length < 1 || attendeesInput.length > 10) {
      return response(400, { error: 'Registra entre 1 y 10 asistentes' });
    }

    const attendees = attendeesInput.map(attendee => ({
      seat_id: String(attendee?.seatId || '').trim().toUpperCase(),
      customer_name: String(attendee?.name || '').trim(),
      customer_email: String(attendee?.email || '').trim().toLowerCase(),
      customer_phone: String(attendee?.phone || '').trim(),
      privacy_accepted: attendee?.privacyAccepted === true,
      terms_accepted: attendee?.termsAccepted === true,
    }));
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[0-9+(). -]{7,32}$/;
    const seatIds = attendees.map(attendee => attendee.seat_id);

    if (new Set(seatIds).size !== seatIds.length || attendees.some(attendee =>
      !seatPricing.isValidSeat(attendee.seat_id) ||
      attendee.customer_name.length < 2 || attendee.customer_name.length > 120 ||
      !emailPattern.test(attendee.customer_email) ||
      !phonePattern.test(attendee.customer_phone) ||
      !attendee.privacy_accepted || !attendee.terms_accepted
    )) {
      return response(400, { error: 'Revisa la silla, los datos y las aceptaciones de cada asistente' });
    }

    const pricing = seatPricing.summarizeSeats(seatIds, receivedAt);
    if (pricing.total !== amount) {
      return response(400, {
        error: 'El valor registrado (' + amount.toLocaleString('es-CO') +
          ') no coincide con el precio de las sillas (' + pricing.total.toLocaleString('es-CO') + ' COP)',
      });
    }

    // Fail before saving a paid reservation if public ticket links are not configured.
    publicUrl('/inscribirse/', { ref: 'ST-TRANSFER-CHECK' });

    const priceBySeat = new Map(pricing.items.map(item => [item.seatId, item.price]));
    const rpcAttendees = attendees.map(attendee => ({
      ...attendee,
      amount: priceBySeat.get(attendee.seat_id),
    }));
    const rpcUrl = new URL('/rest/v1/rpc/st_create_manual_transfer_reservations', process.env.SUPABASE_URL);
    const databaseResult = await requestJson({
      method: 'POST',
      hostname: rpcUrl.hostname,
      path: rpcUrl.pathname + rpcUrl.search,
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      },
      body: {
        p_event_id: EVENT.id,
        p_receipt_reference: paymentReference,
        p_amount: amount,
        p_received_at: new Date(receivedAt).toISOString(),
        p_recorded_by: operatorName,
        p_attendees: rpcAttendees,
        p_privacy_policy_version: LEGAL.privacyPolicyVersion,
        p_terms_version: LEGAL.termsVersion,
      },
    });

    if (databaseResult.status < 200 || databaseResult.status >= 300 || !databaseResult.data?.tickets) {
      const databaseMessage = String(databaseResult.data?.message || '');
      const duplicateReference = databaseResult.data?.code === '23505' ||
        databaseMessage.toLowerCase().includes('duplicate key') ||
        databaseMessage.toLowerCase().includes('already exists');
      return response(409, {
        error: duplicateReference
          ? 'Ese comprobante ya está registrado. Actualiza las reservas antes de volver a intentarlo.'
          : 'No se registró la transferencia. Verifica que las sillas sigan disponibles y vuelve a revisar los datos.',
      });
    }

    const tickets = databaseResult.data.tickets;
    const delivery = await Promise.all(tickets.map(async ticket => {
      try {
        const email = await sendTicketEmail(ticket);
        return { ...ticket, ticket_url: publicUrl('/inscribirse/', { ref: ticket.qr_code }), email_sent: email.sent, email_error: email.error };
      } catch {
        return {
          ...ticket,
          ticket_url: publicUrl('/inscribirse/', { ref: ticket.qr_code }),
          email_sent: false,
          email_error: 'No se pudo enviar el correo; puedes reintentarlo desde el panel.',
        };
      }
    }));

    return response(200, {
      created: true,
      paymentReference,
      amount,
      tickets: delivery,
    });
  } catch (error) {
    console.error('Manual transfer registration failed', error?.message || 'unknown error');
    return response(500, { error: 'No fue posible registrar la transferencia' });
  }
};
