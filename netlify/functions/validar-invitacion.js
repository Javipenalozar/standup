// Netlify Function — Validar código de invitación
// GET /.netlify/functions/validar-invitacion?code=INV-XXXXXXXX

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

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const code = event.queryStringParameters?.code;
  if (!code) return { statusCode: 400, headers, body: '{"error":"Missing code"}' };

  try {
    const rows = await supabaseGet(
      '/rest/v1/invitations?code=eq.' + encodeURIComponent(code) + '&select=*&limit=1'
    );

    if (!rows || rows.length === 0) {
      return { statusCode: 404, headers, body: '{"error":"Código no válido"}' };
    }

    const inv = rows[0];
    if (inv.used && !inv.multi_use) {
      return { statusCode: 410, headers, body: '{"error":"Este código ya fue utilizado"}' };
    }

    let usedSeats = 0;
    if (inv.total_quota) {
      const reservations = await supabaseGet(
        '/rest/v1/reservations?invitation_code=eq.' + encodeURIComponent(inv.code) +
        '&payment_status=in.(paid,pending)&select=id'
      );
      usedSeats = Array.isArray(reservations) ? reservations.length : 0;

      if (usedSeats >= inv.total_quota) {
        return { statusCode: 410, headers, body: '{"error":"Los cupos de esta empresa ya fueron utilizados"}' };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        code: inv.code,
        guest_name: inv.guest_name,
        max_seats: inv.max_seats,
        multi_use: inv.multi_use || false,
        corporate: Boolean(inv.total_quota),
        total_quota: inv.total_quota || null,
        used_seats: usedSeats,
        remaining_seats: inv.total_quota ? inv.total_quota - usedSeats : null,
      }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: '{"error":"Error interno"}' };
  }
};
