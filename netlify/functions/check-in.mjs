import crypto from 'node:crypto';

const EVENT_ID = 'standup-therapy-bogota-2sep2026';
const SELECT_FIELDS = [
  'id',
  'seat_id',
  'customer_name',
  'customer_email',
  'payment_status',
  'qr_code',
  'amount',
  'attendee_name',
  'invitation_code',
  'checked_in_at',
  'checked_in_by',
].join(',');

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isAuthorized(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const provided = String(password || '');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (!expected || expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function supabase(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!base || !key) throw new Error('Supabase is not configured');

  const response = await fetch(new URL(path, base), {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { ok: response.ok, status: response.status, data };
}

function normalizeCode(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 500) return '';
  try {
    const url = new URL(raw);
    return String(url.searchParams.get('ref') || '').trim().slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CO');
}

function sortSeats(a, b) {
  const [rowA, numberA] = a.split('-');
  const [rowB, numberB] = b.split('-');
  return rowA === rowB
    ? Number(numberA) - Number(numberB)
    : rowA.localeCompare(rowB);
}

function formatTicket(rows) {
  const sorted = [...rows].sort((a, b) => sortSeats(a.seat_id, b.seat_id));
  const first = sorted[0];
  return {
    qrCode: first.qr_code,
    name: first.customer_name,
    email: first.customer_email,
    paymentStatus: first.payment_status,
    invitationCode: first.invitation_code,
    seats: sorted.map(row => ({
      id: row.id,
      seatId: row.seat_id,
      attendeeName: row.attendee_name || row.customer_name,
      checkedInAt: row.checked_in_at,
      checkedInBy: row.checked_in_by,
    })),
  };
}

async function loadTicket(code) {
  const result = await supabase(
    '/rest/v1/reservations?select=' + SELECT_FIELDS +
      '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&qr_code=eq.' + encodeURIComponent(code) +
      '&order=seat_id.asc'
  );
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error('Could not load ticket');
  }
  return result.data;
}

async function loadPaidReservations() {
  const result = await supabase(
    '/rest/v1/reservations?select=' + SELECT_FIELDS +
      '&event_id=eq.' + encodeURIComponent(EVENT_ID) +
      '&payment_status=eq.paid&order=seat_id.asc'
  );
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error('Could not load reservations');
  }
  return result.data;
}

function groupTickets(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.qr_code)) groups.set(row.qr_code, []);
    groups.get(row.qr_code).push(row);
  }
  return [...groups.values()].map(formatTicket);
}

async function handleStats() {
  const rows = await loadPaidReservations();
  const checkedInRows = rows.filter(row => row.checked_in_at);
  const recent = [...checkedInRows]
    .sort((left, right) => new Date(right.checked_in_at) - new Date(left.checked_in_at))
    .slice(0, 10)
    .map(row => ({
      reservationId: row.id,
      seatId: row.seat_id,
      name: row.customer_name,
      checkedInAt: row.checked_in_at,
      checkedInBy: row.checked_in_by,
    }));
  return json(200, {
    checkedIn: checkedInRows.length,
    pending: rows.length - checkedInRows.length,
    total: rows.length,
    recent,
  });
}

async function handleLookup(codeInput) {
  const code = normalizeCode(codeInput);
  if (!code) return json(400, { error: 'Código inválido' });
  const rows = await loadTicket(code);
  if (rows.length === 0) return json(404, { error: 'Entrada no encontrada' });
  return json(200, { ticket: formatTicket(rows) });
}

async function handleSearch(query) {
  const needle = normalizeText(query).trim();
  if (needle.length < 2) {
    return json(400, { error: 'Escribe al menos dos caracteres' });
  }

  const rows = await loadPaidReservations();
  const matches = rows.filter(row => [
    row.customer_name,
    row.customer_email,
    row.seat_id,
    row.qr_code,
    row.attendee_name,
  ].some(value => normalizeText(value).includes(needle)));

  return json(200, { tickets: groupTickets(matches).slice(0, 25) });
}

async function handleMutation(action, codeInput, requestedSeats, operatorInput) {
  const code = normalizeCode(codeInput);
  const operator = String(operatorInput || '').trim().slice(0, 80);
  const seatIds = [...new Set(
    (Array.isArray(requestedSeats) ? requestedSeats : [])
      .map(value => String(value).trim().toUpperCase())
  )];

  if (!code || !operator || seatIds.length === 0 || seatIds.length > 20) {
    return json(400, { error: 'Datos de ingreso incompletos' });
  }

  const before = await loadTicket(code);
  if (before.length === 0) return json(404, { error: 'Entrada no encontrada' });
  if (before.some(row => row.payment_status !== 'paid')) {
    return json(409, { error: 'Esta entrada no está confirmada' });
  }

  const ticketSeatIds = new Set(before.map(row => row.seat_id));
  if (seatIds.some(seatId => !ticketSeatIds.has(seatId))) {
    return json(400, { error: 'La selección contiene una silla inválida' });
  }

  const result = await supabase('/rest/v1/rpc/st_record_checkin', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      p_event_id: EVENT_ID,
      p_qr_code: code,
      p_seat_ids: seatIds,
      p_operator: operator,
      p_action: action,
    }),
  });

  if (!result.ok || !Array.isArray(result.data)) {
    console.error('Check-in RPC failed', result.status, result.data);
    return json(502, { error: 'No fue posible registrar el ingreso' });
  }

  const after = await loadTicket(code);
  return json(200, {
    ticket: formatTicket(after),
    changedSeats: result.data.map(row => row.seat_id),
    skippedSeats: seatIds.filter(
      seatId => !result.data.some(row => row.seat_id === seatId)
    ),
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });

  try {
    const body = await request.json();
    if (!isAuthorized(body.password)) {
      return json(401, { error: 'No autorizado' });
    }

    switch (body.action) {
      case 'stats': return handleStats();
      case 'lookup': return handleLookup(body.code);
      case 'search': return handleSearch(body.query);
      case 'checkin': return handleMutation('checkin', body.code, body.seatIds, body.operator);
      case 'undo': return handleMutation('undo', body.code, body.seatIds, body.operator);
      default: return json(400, { error: 'Acción inválida' });
    }
  } catch (error) {
    console.error('Check-in function error', error);
    return json(500, { error: 'Error interno' });
  }
}
