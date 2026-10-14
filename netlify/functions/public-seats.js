const https = require('https');
const { EVENT, eventOperationsEnabled } = require('../lib/event-config');
const seatPricing = require('../../seat-pricing');

const EVENT_ID = EVENT.id;

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
  const serverTime = new Date().toISOString();
  const pricing = seatPricing.getPricingState(serverTime);
  if (!eventOperationsEnabled()) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ seats: [], preview: true, serverTime, pricing }),
    };
  }

  try {
    const [result, holdsResult] = await Promise.all([
      supabaseGet(
        '/rest/v1/st_event_reservations?select=seat_id' +
        '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&payment_status=in.(paid,pending)'
      ),
      supabaseGet(
        '/rest/v1/st_event_seat_holds?select=seat_id' +
        '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&status=eq.active' +
        '&hold_expires_at=gt.' + encodeURIComponent(serverTime)
      ),
    ]);

    if (
      result.status >= 400 || !Array.isArray(result.data) ||
      holdsResult.status >= 400 || !Array.isArray(holdsResult.data)
    ) {
      console.error(
        'Could not load occupied seats',
        result.status,
        result.data,
        holdsResult.status,
        holdsResult.data
      );
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'No fue posible cargar las sillas ocupadas' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        seats: [...new Set([
          ...result.data.map(row => row.seat_id),
          ...holdsResult.data.map(row => row.seat_id),
        ])],
        serverTime,
        pricing,
      }),
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
