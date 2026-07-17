// Netlify Function — Crear código de invitación
// Solo accesible con la clave admin (BOLD_SECRET_KEY como password simple)
//
// POST /.netlify/functions/crear-invitacion
// Body: { "nombre": "Juan Pérez", "cantidad": 2, "password": "tu-password" }
//
// Responde con un link listo para enviar por WhatsApp.

const https = require('https');
const crypto = require('crypto');

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

  try {
    const {
      nombre,
      cantidad,
      password,
      multi_use,
      corporate,
      total_quota,
      dry_run,
    } = JSON.parse(event.body);

    if (password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, headers, body: '{"error":"Password incorrecto"}' };
    }

    if (dry_run) {
      return { statusCode: 200, headers, body: '{"ok":true}' };
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

    const result = await supabasePost('/rest/v1/invitations', {
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

    const link = 'https://standup.eventosjv.com/invitado/?code=' + code;

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
