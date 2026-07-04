// Netlify Function — Verificar estado de pago
// El frontend llama aquí cuando el usuario vuelve de Bold
// para confirmar que el pago fue exitoso.
//
// Variables de entorno requeridas:
//   SUPABASE_URL  — https://rpgagnnhsefwaethszfl.supabase.co
//   SUPABASE_KEY  — tu service_role key de Supabase

const https = require('https');

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

exports.handler = async function (event) {
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
      '/rest/v1/reservations?qr_code=eq.' + encodeURIComponent(ref) + '&select=payment_status&limit=1'
    );

    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'not_found' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: rows[0].payment_status }),
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
