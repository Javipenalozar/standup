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
  if (request.method === 'GET') {
    return adminAuth.isAuthorizedRequest(request)
      ? json(200, { authenticated: true })
      : json(401, { error: 'Sesión vencida' });
  }

  if (request.method === 'DELETE') {
    return json(200, { authenticated: false }, { 'Set-Cookie': adminAuth.expiredSessionCookie() });
  }

  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });

  if (adminAuth.isRateLimited(Object.fromEntries(request.headers.entries()))) {
    return json(429, { error: 'Demasiados intentos. Espera 15 minutos.' }, { 'Retry-After': '900' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Solicitud inválida' });
  }

  if (!adminAuth.verifyPassword(body.password)) {
    adminAuth.recordFailure(Object.fromEntries(request.headers.entries()));
    return json(401, { error: 'Credenciales incorrectas' });
  }

  try {
    const token = adminAuth.createSession();
    adminAuth.clearFailures(Object.fromEntries(request.headers.entries()));
    return json(200, { authenticated: true }, { 'Set-Cookie': adminAuth.sessionCookie(token) });
  } catch (error) {
    console.error('Admin session configuration error', error);
    return json(503, { error: 'La sesión administrativa no está configurada' });
  }
}

export const config = {
  path: '/.netlify/functions/admin-session',
};
