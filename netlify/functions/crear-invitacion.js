// Netlify Function — Crear código de invitación
// Solo accesible con una sesión administrativa firmada.
//
// POST /.netlify/functions/crear-invitacion
// Body: { "nombre": "Juan Pérez", "cantidad": 2 }
//
// Responde con un link listo para enviar por WhatsApp.

const https = require('https');
const crypto = require('crypto');
const { EVENT, eventOperationsEnabled, publicUrl } = require('../lib/event-config');
const adminAuth = require('../lib/admin-auth');

function supabasePost(path, body, key) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, process.env.SUPABASE_URL);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation',
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
    req.write(JSON.stringify(body));
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
  if (!eventOperationsEnabled()) {
    return { statusCode: 503, headers, body: '{"error":"Las operaciones del evento permanecen bloqueadas"}' };
  }

  try {
    const {
      nombre,
      cantidad,
      multi_use,
      corporate,
      total_quota,
    } = JSON.parse(event.body);

    if (!adminAuth.isAuthorizedEvent(event)) {
      return { statusCode: 401, headers, body: '{"error":"Sesión administrativa vencida"}' };
    }

    if (!nombre || !cantidad || cantidad < 1 || cantidad > 10) {
      return { statusCode: 400, headers, body: '{"error":"Nombre y cantidad (1-10) requeridos"}' };
    }

    const corporateQuota = Number(total_quota);
    if (corporate && (!Number.isInteger(corporateQuota) || corporateQuota < 1 || corporateQuota > 500)) {
      return { statusCode: 400, headers, body: '{"error":"El cupo empresarial debe estar entre 1 y 500"}' };
    }

    const codePrefix = corporate ? 'EMP-' : multi_use ? 'PAGO-' : 'INV-';
    const code = codePrefix + crypto.randomBytes(4).toString('hex').toUpperCase();

    const result = await supabasePost('/rest/v1/st_event_invitations', {
      event_id: EVENT.id,
      code,
      guest_name: nombre,
      max_seats: cantidad,
      used: false,
      multi_use: corporate || multi_use || false,
      total_quota: corporate ? corporateQuota : null,
    }, process.env.SUPABASE_KEY);

    if (result.status >= 400) {
      console.error('Supabase error:', result.data);
      return { statusCode: 500, headers, body: '{"error":"Error guardando invitación"}' };
    }

    const link = publicUrl('/invitado/', { code });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        code,
        link,
        nombre,
        cantidad,
        corporate: Boolean(corporate),
        total_quota: corporate ? corporateQuota : null,
      }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: '{"error":"Error interno"}' };
  }
};
