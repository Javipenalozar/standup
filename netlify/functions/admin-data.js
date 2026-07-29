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
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  try {
    const { password } = JSON.parse(event.body || '{}');
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
    }

    const [reservationsResult, invitationsResult] = await Promise.all([
      supabaseGet(
        '/rest/v1/reservations?select=*' +
        '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&order=created_at.desc'
      ),
      supabaseGet('/rest/v1/invitations?select=*&order=created_at.desc'),
    ]);

    if (
      reservationsResult.status >= 400 ||
      invitationsResult.status >= 400 ||
      !Array.isArray(reservationsResult.data) ||
      !Array.isArray(invitationsResult.data)
    ) {
      console.error(
        'Could not load admin data',
        reservationsResult.status,
        reservationsResult.data,
        invitationsResult.status,
        invitationsResult.data
      );
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'No fue posible consultar las reservas' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reservations: reservationsResult.data,
        invitations: invitationsResult.data,
      }),
    };
  } catch (error) {
    console.error('Admin data error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno' }),
    };
  }
};
