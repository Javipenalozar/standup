'use strict';

// Recepción rápida del webhook. La lógica de negocio corre en una función de fondo.

const crypto = require('crypto');
const https = require('https');
const { getPublicSiteUrl, realPaymentsEnabled } = require('../lib/event-config');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

function verifyBoldSignature(rawBody, signature, secret = process.env.BOLD_SECRET_KEY) {
  if (!secret || !signature) return false;
  const bodyBase64 = Buffer.from(rawBody, 'utf8').toString('base64');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(bodyBase64)
    .digest('hex');
  const provided = String(signature).trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function queueBackground(rawBody, signature) {
  return new Promise((resolve, reject) => {
    const target = new URL(
      '/.netlify/functions/bold-webhook-process-background',
      getPublicSiteUrl()
    );
    const req = https.request({
      method: 'POST',
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
        'X-Bold-Signature': signature,
        'User-Agent': 'standup-therapy-webhook/2.0',
      },
    }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode === 202 || res.statusCode === 200) resolve(res.statusCode);
        else reject(new Error('Background queue returned HTTP ' + res.statusCode));
      });
    });

    req.setTimeout(1250, () => req.destroy(new Error('Background queue timeout')));
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }
  if (!realPaymentsEnabled()) {
    return jsonResponse(503, { error: 'Payments are disabled for this event release' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  const signature =
    event.headers?.['x-bold-signature'] ||
    event.headers?.['X-Bold-Signature'];

  if (!verifyBoldSignature(rawBody, signature)) {
    console.warn('Rejected Bold webhook with invalid signature');
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  try {
    JSON.parse(rawBody);
    await queueBackground(rawBody, signature);
    return jsonResponse(200, { ok: true, queued: true });
  } catch (error) {
    console.error('Could not queue Bold webhook', error);
    return jsonResponse(503, { error: 'Webhook queue unavailable' });
  }
};

exports._test = { verifyBoldSignature };
