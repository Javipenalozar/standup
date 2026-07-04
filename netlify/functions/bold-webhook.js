// Netlify Function — Webhook de Bold
// Bold llama a esta URL cuando un pago cambia de estado.
//
// Configura en Bold Dashboard → Webhooks:
//   URL: https://standup.eventosjv.com/.netlify/functions/bold-webhook
//
// Variables de entorno requeridas en Netlify:
//   BOLD_SECRET_KEY  — tu secret key de Bold (para verificar firma)
//   SUPABASE_URL     — https://rpgagnnhsefwaethszfl.supabase.co
//   SUPABASE_KEY     — tu service_role key de Supabase (NO la anon key)

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
        'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body);

    // Bold envía el estado del pago en el webhook
    // Estructura: { event: 'PAYMENT_APPROVED', data: { order_reference, status, ... } }
    const boldEvent = payload.event || payload.type;
    const paymentData = payload.data || payload;
    const orderRef = paymentData.order_reference || paymentData.reference;
    const status = paymentData.status;

    console.log('Bold webhook:', boldEvent, orderRef, status);

    if (!orderRef) {
      return { statusCode: 400, body: 'Missing order_reference' };
    }

    // Mapear estados de Bold a nuestros estados
    let newStatus;
    if (boldEvent === 'PAYMENT_APPROVED' || status === 'APPROVED') {
      newStatus = 'paid';
    } else if (boldEvent === 'PAYMENT_REJECTED' || status === 'REJECTED') {
      newStatus = 'cancelled';
    } else if (boldEvent === 'PAYMENT_ERROR' || status === 'ERROR') {
      newStatus = 'cancelled';
    } else {
      return { statusCode: 200, body: 'Event ignored: ' + boldEvent };
    }

    // Actualizar estado en Supabase
    const result = await supabaseRequest(
      'PATCH',
      '/rest/v1/reservations?qr_code=eq.' + encodeURIComponent(orderRef) + '&payment_status=eq.pending',
      { payment_status: newStatus }
    );

    console.log('Supabase update:', result.status);

    // Si el pago fue cancelado/rechazado, liberar las sillas
    if (newStatus === 'cancelled') {
      await supabaseRequest(
        'DELETE',
        '/rest/v1/reservations?qr_code=eq.' + encodeURIComponent(orderRef) + '&payment_status=eq.cancelled'
      );
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, status: newStatus }) };

  } catch (e) {
    console.error('Webhook error:', e);
    return { statusCode: 500, body: 'Internal error' };
  }
};
