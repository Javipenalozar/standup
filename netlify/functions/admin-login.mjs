import adminAuth from '../lib/admin-auth.js';

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });

  const headers = Object.fromEntries(request.headers.entries());
  if (adminAuth.isRateLimited(headers)) {
    return json(429, { error: 'Demasiados intentos. Espera 15 minutos.' }, { 'Retry-After': '900' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Solicitud inválida' });
  }

  if (!adminAuth.verifyPassword(body.password)) {
    adminAuth.recordFailure(headers);
    return json(401, { error: 'Credenciales incorrectas' });
  }

  try {
    const token = adminAuth.createSession();
    adminAuth.clearFailures(headers);
    return json(200, { authenticated: true }, { 'Set-Cookie': adminAuth.sessionCookie(token) });
  } catch (error) {
    console.error('Admin session configuration error', error);
    return json(503, { error: 'La sesión administrativa no está configurada' });
  }
}

export const config = {
  path: '/.netlify/functions/admin-login',
  rateLimit: {
    action: 'rate_limit',
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ['ip', 'domain'],
  },
};
