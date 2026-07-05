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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ orderRef, seats, name, email }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: '{"error":"Error interno"}' };
  }
};
