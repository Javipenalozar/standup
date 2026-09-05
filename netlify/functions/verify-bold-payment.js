// Netlify Function — Verificar estado de pago
// El frontend llama aquí cuando el usuario vuelve de Bold
// para confirmar que el pago fue exitoso.
//
// Variables de entorno requeridas: SUPABASE_URL, SUPABASE_KEY y BOLD_API_KEY.

const https = require('https');
const { EVENT, realPaymentsEnabled } = require('../lib/event-config');

function maskEmail(value) {
  const email = String(value || '');
  const at = email.indexOf('@');
  if (at <= 0) return '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.slice(0, 2) + '***@' + domain;
}

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, process.env.SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve([]); }
      });
    }).on('error', reject);
  });
}

function supabasePatch(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, process.env.SUPABASE_URL);
    const options = {
      method: 'PATCH',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function getBoldLink(paymentLink) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'integrations.api.bold.co',
      path: '/online/link/v1/' + encodeURIComponent(paymentLink),
      headers: {
        Authorization: 'x-api-key ' + process.env.BOLD_API_KEY,
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch {}
        resolve({ statusCode: res.statusCode, data: parsed });
      });
    }).on('error', reject);
  });
}

exports.handler = async function (event) {
  if (!realPaymentsEnabled()) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Los pagos permanecen bloqueados' }),
    };
  }
  const ref = event.queryStringParameters?.ref;
  if (!ref) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing ref parameter' }),
    };
  }

  try {
    const rows = await supabaseGet(
      '/rest/v1/st_event_reservations?event_id=eq.' + encodeURIComponent(EVENT.id) +
      '&qr_code=eq.' + encodeURIComponent(ref) +
      '&select=payment_status,seat_id,customer_name,customer_email,amount,bold_reference&order=seat_id.asc'
    );

    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'not_found' }),
      };
    }

    const boldReference = rows[0].bold_reference;
    let providerStatus = null;
    let checkoutUrl = null;

    if (rows[0].payment_status === 'pending' && boldReference) {
      const bold = await getBoldLink(boldReference);
      if (bold.statusCode >= 200 && bold.statusCode < 300 && bold.data) {
        providerStatus = String(bold.data.status || '').toUpperCase() || null;
        if (providerStatus === 'ACTIVE' || providerStatus === 'PROCESSING') {
          checkoutUrl = 'https://checkout.bold.co/' + encodeURIComponent(boldReference);
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: rows[0].payment_status,
        seats: rows.map(row => row.seat_id),
        name: rows[0].customer_name,
        email: maskEmail(rows[0].customer_email),
        amount: rows.reduce((total, row) => total + Number(row.amount || 0), 0),
        providerStatus,
        checkoutUrl,
      }),
    };

  } catch (e) {
    console.error('Verify error:', e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};
