import https from 'node:https';

const EVENT_ID = 'standup-therapy-bogota-2sep2026';

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name];
}

function requestJson({ method, hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ method, hostname, path, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function supabaseRequest(method, path, body) {
  const url = new URL(path, env('SUPABASE_URL'));
  const key = env('SUPABASE_KEY');

  return requestJson({
    method,
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: method === 'PATCH' ? 'return=representation' : 'return=minimal',
    },
    body,
  });
}

async function getBoldLink(paymentLink) {
  return requestJson({
    method: 'GET',
    hostname: 'integrations.api.bold.co',
    path: '/online/link/v1/' + encodeURIComponent(paymentLink),
    headers: {
      Authorization: 'x-api-key ' + env('BOLD_API_KEY'),
    },
  });
}

async function deletePending(reference, expiresAt) {
  return supabaseRequest(
    'DELETE',
    '/rest/v1/reservations?event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&qr_code=eq.' + encodeURIComponent(reference) +
      '&payment_status=eq.pending' +
      '&hold_expires_at=lte.' + encodeURIComponent(expiresAt),
    null
  );
}

async function markPaid(paymentLink) {
  return supabaseRequest(
    'PATCH',
    '/rest/v1/reservations?event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&bold_reference=eq.' + encodeURIComponent(paymentLink) +
      '&payment_status=eq.pending',
    { payment_status: 'paid' }
  );
}

export default async () => {
  const now = new Date().toISOString();
  const lookup = await supabaseRequest(
    'GET',
    '/rest/v1/reservations?event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&payment_status=eq.pending' +
      '&hold_expires_at=not.is.null' +
      '&hold_expires_at=lte.' + encodeURIComponent(now) +
      '&select=qr_code,bold_reference,hold_expires_at' +
      '&order=hold_expires_at.asc&limit=200',
    null
  );

  if (lookup.status >= 400 || !Array.isArray(lookup.data)) {
    console.error('Could not read expired holds', lookup.status, lookup.data);
    return new Response('Lookup failed', { status: 500 });
  }

  const holds = new Map();
  for (const row of lookup.data) {
    if (!holds.has(row.qr_code)) holds.set(row.qr_code, row);
  }

  let released = 0;
  let paid = 0;
  let retained = 0;

  for (const [reference, hold] of holds) {
    if (!hold.bold_reference) {
      const deletion = await deletePending(reference, hold.hold_expires_at);
      if (deletion.status < 400) released += 1;
      else console.error('Could not release unmapped hold', reference, deletion.status);
      continue;
    }

    const bold = await getBoldLink(hold.bold_reference);
    if (bold.status >= 400 || !bold.data) {
      retained += 1;
      console.error('Could not verify Bold link', hold.bold_reference, bold.status);
      continue;
    }

    const status = String(bold.data.status || '').toUpperCase();
    if (status === 'PAID') {
      const update = await markPaid(hold.bold_reference);
      if (update.status < 400) paid += 1;
      else console.error('Could not mark paid hold', reference, update.status);
      continue;
    }

    if (['EXPIRED', 'CANCELLED', 'REJECTED'].includes(status)) {
      const deletion = await deletePending(reference, hold.hold_expires_at);
      if (deletion.status < 400) released += 1;
      else console.error('Could not release expired hold', reference, deletion.status);
      continue;
    }

    retained += 1;
    console.info('Retained hold while Bold status is', reference, status || 'UNKNOWN');
  }

  console.info('Expired hold cleanup', { checked: holds.size, released, paid, retained });
  return new Response('OK');
};

export const config = {
  schedule: '* * * * *',
};
