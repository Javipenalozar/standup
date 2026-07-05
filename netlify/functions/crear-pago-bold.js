const https = require('https');

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

    const boldBody = JSON.stringify(body);

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        method: 'POST',
        hostname: 'api.bold.co',
        path: '/online/link/v1',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'x-api-key ' + process.env.BOLD_API_KEY,
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      req.write(boldBody);
      req.end();
    });

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
