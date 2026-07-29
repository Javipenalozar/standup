const https = require('https');

const HOLD_DURATION_MS = 15 * 60 * 1000;
const EVENT_ID = 'standup-therapy-bogota-2sep2026';
const PRICE = 69000;

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

async function saveBoldReference(orderReference, boldReference, expiresAt) {
  const url = new URL(
    '/rest/v1/reservations?qr_code=eq.' +
      encodeURIComponent(orderReference) +
      '&payment_status=eq.pending',
    process.env.SUPABASE_URL
  );

  return requestJson({
    method: 'PATCH',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      Prefer: 'return=representation',
    },
    body: {
      bold_reference: boldReference,
      hold_expires_at: expiresAt.toISOString(),
    },
  });
}

async function supabaseRequest(method, path, body, prefer = 'return=representation') {
  const url = new URL(path, process.env.SUPABASE_URL);
  return requestJson({
    method,
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      Prefer: prefer,
    },
    body,
  });
}

async function rollbackReservation(orderReference) {
  return supabaseRequest(
    'DELETE',
    '/rest/v1/reservations?qr_code=eq.' + encodeURIComponent(orderReference) +
      '&payment_status=eq.pending',
    null,
    'return=minimal'
  );
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
    const body = JSON.parse(event.body || '{}');
    const seats = Array.isArray(body.seats)
      ? [...new Set(body.seats.map(value => String(value).toUpperCase()))]
      : [];
    const customer = body.customer || {};
    const orderReference = String(body.order_reference || '');
    const validSeats = seats.length > 0 &&
      seats.length <= 10 &&
      seats.every(seat => /^(?:[A-J]-(?:[1-9]|1\d|2[0-2])|K-(?:[1-9]|1\d))$/.test(seat));

    if (
      !validSeats ||
      !orderReference.startsWith('ST-') ||
      !customer.name ||
      !customer.email ||
      !customer.phone
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Datos de la reserva incompletos' }),
      };
    }

    const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
    const reservations = seats.map(seatId => ({
      event_id: EVENT_ID,
      seat_id: seatId,
      customer_name: String(customer.name).trim(),
      customer_email: String(customer.email).trim().toLowerCase(),
      customer_phone: String(customer.phone).trim(),
      payment_status: 'pending',
      qr_code: orderReference,
      amount: PRICE,
      hold_expires_at: expiresAt.toISOString(),
    }));
    const reservationResult = await supabaseRequest(
      'POST',
      '/rest/v1/reservations',
      reservations
    );

    if (reservationResult.status >= 400) {
      console.error('Could not reserve seats', reservationResult.status, reservationResult.data);
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Algunas sillas ya fueron reservadas' }),
      };
    }

    const boldBody = {
      amount_type: 'CLOSE',
      amount: {
        currency: 'COP',
        total_amount: seats.length * PRICE,
        tip_amount: 0,
      },
      description: 'Stand-Up Therapy - ' + seats.length + ' silla(s): ' + seats.join(', '),
      payment_method: ['CARD', 'PSE', 'NEQUI', 'DAVIPLATA'],
      order_reference: orderReference,
      redirect_url:
        'https://standup.eventosjv.com/inscribirse/?ref=' +
        encodeURIComponent(orderReference),
      payer_email: String(customer.email).trim().toLowerCase(),
      // Bold documents this value as Unix nanoseconds.
      expiration_date: expiresAt.getTime() * 1e6,
    };

    const result = await requestJson({
      method: 'POST',
      hostname: 'integrations.api.bold.co',
      path: '/online/link/v1',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'x-api-key ' + process.env.BOLD_API_KEY,
      },
      body: boldBody,
    });

    const boldReference = result.data?.payload?.payment_link;
    if (result.status >= 200 && result.status < 300 && boldReference) {
      const mapping = await saveBoldReference(orderReference, boldReference, expiresAt);
      if (mapping.status >= 400 || !Array.isArray(mapping.data) || mapping.data.length === 0) {
        console.error('Could not save Bold reference mapping', mapping.status, mapping.data);
        await rollbackReservation(orderReference);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'No se pudo vincular el pago con la reserva' }),
        };
      }

      console.info('Bold reference mapped', boldReference, orderReference);
    } else {
      await rollbackReservation(orderReference);
    }

    return {
      statusCode: result.status,
      headers,
      body: JSON.stringify(result.data),
    };
  } catch (e) {
    console.error('Bold proxy error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error conectando con Bold' }) };
  }
};
