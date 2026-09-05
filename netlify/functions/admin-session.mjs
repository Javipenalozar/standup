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

  return json(405, { error: 'Método no permitido' });
}

export const config = {
  path: '/.netlify/functions/admin-session',
};
