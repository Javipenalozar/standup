const https = require('https');

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

async function saveBoldReference(orderReference, boldReference) {
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
    body: { bold_reference: boldReference },
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
    const body = JSON.parse(event.body);

    const result = await requestJson({
      method: 'POST',
      hostname: 'integrations.api.bold.co',
      path: '/online/link/v1',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'x-api-key ' + process.env.BOLD_API_KEY,
      },
      body,
    });

    const boldReference = result.data?.payload?.payment_link;
    if (result.status >= 200 && result.status < 300 && boldReference) {
      const mapping = await saveBoldReference(body.order_reference, boldReference);
      if (mapping.status >= 400 || !Array.isArray(mapping.data) || mapping.data.length === 0) {
        console.error('Could not save Bold reference mapping', mapping.status, mapping.data);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'No se pudo vincular el pago con la reserva' }),
        };
      }

      console.info('Bold reference mapped', boldReference, body.order_reference);
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
