const https = require('https');
const { EVENT, eventOperationsEnabled } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

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
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }
  if (!eventOperationsEnabled()) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Las operaciones del evento permanecen bloqueadas' }) };
  }

  try {
    if (!adminAuth.isAuthorizedEvent(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión administrativa vencida' }) };
    }

    const [reservationsResult, invitationsResult, webhookEventsResult] = await Promise.all([
      supabaseGet(
        '/rest/v1/st_event_reservations?select=*' +
        '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&order=created_at.desc'
      ),
      supabaseGet(
        '/rest/v1/st_event_invitations?event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&select=*&order=created_at.desc'
      ),
      supabaseGet(
        '/rest/v1/st_payment_webhook_events?event_id=eq.' + encodeURIComponent(EVENT_ID) +
        '&select=provider_event_id,event_type,payment_reference,status,notification_status,notification_error,created_at,processed_at' +
        '&order=created_at.desc&limit=30'
      ),
    ]);

    if (
      reservationsResult.status >= 400 ||
      invitationsResult.status >= 400 ||
      webhookEventsResult.status >= 400 ||
      !Array.isArray(reservationsResult.data) ||
      !Array.isArray(invitationsResult.data) ||
      !Array.isArray(webhookEventsResult.data)
    ) {
      console.error(
        'Could not load admin data',
        reservationsResult.status,
        reservationsResult.data,
        invitationsResult.status,
        invitationsResult.data,
        webhookEventsResult.status,
        webhookEventsResult.data
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
        webhookEvents: webhookEventsResult.data,
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
