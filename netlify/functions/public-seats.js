const https = require('https');

const EVENT_ID = 'standup-therapy-bogota-2sep2026';

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, process.env.SUPABASE_URL);
    https.get({
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : []; } catch {}
        resolve({ status: res.statusCode, data });
      });
    }).on('error', reject);
  });
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET only' }) };
  }

  try {
    const result = await supabaseGet(
      '/rest/v1/reservations?select=seat_id' +
      '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&payment_status=in.(paid,pending)'
    );

    if (result.status >= 400 || !Array.isArray(result.data)) {
      console.error('Could not load occupied seats', result.status, result.data);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'No fue posible cargar las sillas ocupadas' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ seats: result.data.map(row => row.seat_id) }),
    };
  } catch (error) {
    console.error('Public seats error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno' }),
    };
  }
};
