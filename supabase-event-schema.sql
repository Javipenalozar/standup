-- Esquema canónico y aislado para Stand-Up Therapy, 5 de noviembre de 2026.
-- Ejecutar completo una sola vez en el proyecto Supabase confirmado.
-- No depende de public.reservations ni de mundo_de_javi.reservations.

begin;

create extension if not exists pgcrypto;

create table if not exists public.st_event_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  seat_id text not null,
  customer_name text not null,
  attendee_name text,
  customer_email text not null,
  customer_phone text not null default '',
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'cancelled')),
  qr_code text not null,
  amount integer not null check (amount >= 0),
  bold_reference text,
  bold_payment_id text,
  bold_paid_at timestamptz,
  invitation_code text,
  hold_expires_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by text,
  privacy_consent_at timestamptz not null,
  privacy_policy_version text not null,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now(),
  constraint st_event_reservations_seat_format_check check (
    seat_id ~ '^([A-J]-([1-9]|1[0-9]|2[0-2])|K-([1-9]|1[0-9]))$'
  )
);

create unique index if not exists st_event_reservations_active_seat_uidx
  on public.st_event_reservations (event_id, seat_id)
  where payment_status in ('pending', 'paid');

create index if not exists st_event_reservations_ticket_idx
  on public.st_event_reservations (event_id, qr_code);

create index if not exists st_event_reservations_bold_idx
  on public.st_event_reservations (event_id, bold_reference)
  where bold_reference is not null;

create index if not exists st_event_reservations_hold_idx
  on public.st_event_reservations (event_id, hold_expires_at)
  where payment_status = 'pending' and hold_expires_at is not null;

create index if not exists st_event_reservations_invitation_idx
  on public.st_event_reservations (event_id, invitation_code)
  where invitation_code is not null;

create index if not exists st_event_reservations_checkin_idx
  on public.st_event_reservations (event_id, checked_in_at)
  where payment_status = 'paid';

create table if not exists public.st_event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  code text not null,
  guest_name text not null,
  max_seats integer not null check (max_seats between 1 and 10),
  used boolean not null default false,
  multi_use boolean not null default false,
  total_quota integer check (total_quota is null or total_quota between 1 and 500),
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

create index if not exists st_event_invitations_event_created_idx
  on public.st_event_invitations (event_id, created_at desc);

create table if not exists public.st_ticket_checkin_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.st_event_reservations(id) on delete set null,
  event_id text not null,
  qr_code text not null,
  seat_id text not null,
  action text not null check (action in ('checked_in', 'reverted')),
  operator_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists st_ticket_checkin_events_event_created_idx
  on public.st_ticket_checkin_events (event_id, created_at desc);

create index if not exists st_ticket_checkin_events_reservation_idx
  on public.st_ticket_checkin_events (reservation_id)
  where reservation_id is not null;

create table if not exists public.st_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_id text not null,
  event_type text not null,
  payment_reference text,
  payment_id text,
  amount integer,
  currency text,
  status text not null default 'received',
  result jsonb,
  payload jsonb not null,
  notification_status text not null default 'not_required',
  notification_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists st_payment_webhook_events_payment_idx
  on public.st_payment_webhook_events (event_id, payment_id)
  where payment_id is not null;

alter table public.st_event_reservations enable row level security;
alter table public.st_event_invitations enable row level security;
alter table public.st_ticket_checkin_events enable row level security;
alter table public.st_payment_webhook_events enable row level security;

revoke all on table public.st_event_reservations from public, anon, authenticated;
revoke all on table public.st_event_invitations from public, anon, authenticated;
revoke all on table public.st_ticket_checkin_events from public, anon, authenticated;
revoke all on table public.st_payment_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on table public.st_event_reservations to service_role;
grant select, insert, update, delete on table public.st_event_invitations to service_role;
grant select, insert, update, delete on table public.st_ticket_checkin_events to service_role;
grant select, insert, update, delete on table public.st_payment_webhook_events to service_role;

create or replace function public.st_reserve_invitation(
  p_code text,
  p_event_id text,
  p_seats text[],
  p_attendee_names text[],
  p_name text,
  p_email text,
  p_phone text,
  p_order_ref text,
  p_privacy_policy_version text,
  p_terms_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inv public.st_event_invitations%rowtype;
  v_used integer;
  v_requested integer;
  v_remaining integer;
begin
  if nullif(trim(p_event_id), '') is null then
    raise exception 'El evento es obligatorio';
  end if;

  select *
    into v_inv
    from public.st_event_invitations
   where event_id = p_event_id
     and code = p_code
   for update;

  if not found then
    raise exception 'Código de invitación no válido para este evento';
  end if;

  if v_inv.used and not v_inv.multi_use then
    raise exception 'Este código ya fue utilizado';
  end if;

  v_requested := cardinality(p_seats);
  if v_requested is null or v_requested < 1 or v_requested > v_inv.max_seats then
    raise exception 'Esta invitación permite máximo % silla(s)', v_inv.max_seats;
  end if;

  if (select count(distinct seat_id) from unnest(p_seats) as seat_id) <> v_requested then
    raise exception 'La selección contiene sillas repetidas';
  end if;

  if exists (
    select 1
      from unnest(p_seats) as seat_id
     where seat_id !~ '^([A-J]-([1-9]|1[0-9]|2[0-2])|K-([1-9]|1[0-9]))$'
  ) then
    raise exception 'La selección contiene una silla inválida';
  end if;

  if cardinality(p_attendee_names) is distinct from v_requested or exists (
    select 1
      from unnest(p_attendee_names) as attendee(name)
     where nullif(trim(attendee.name), '') is null
  ) then
    raise exception 'Escribe el nombre de cada asistente';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_email), '') is null then
    raise exception 'Nombre y correo son obligatorios';
  end if;

  if nullif(trim(p_privacy_policy_version), '') is null or nullif(trim(p_terms_version), '') is null then
    raise exception 'Falta registrar la aceptación legal';
  end if;

  select count(*)::integer
    into v_used
    from public.st_event_reservations
   where event_id = p_event_id
     and invitation_code = p_code
     and payment_status in ('paid', 'pending');

  if v_inv.total_quota is not null and v_used + v_requested > v_inv.total_quota then
    raise exception 'No quedan suficientes cupos disponibles para esta invitación';
  end if;

  if v_used > 0 and not v_inv.multi_use then
    raise exception 'Este código ya fue utilizado';
  end if;

  if exists (
    select 1
      from public.st_event_reservations
     where event_id = p_event_id
       and invitation_code = p_code
       and lower(trim(customer_email)) = lower(trim(p_email))
       and payment_status in ('paid', 'pending')
  ) then
    raise exception 'Este correo ya registró entradas con este enlace';
  end if;

  insert into public.st_event_reservations (
    event_id,
    seat_id,
    customer_name,
    attendee_name,
    customer_email,
    customer_phone,
    payment_status,
    qr_code,
    amount,
    invitation_code,
    privacy_consent_at,
    privacy_policy_version,
    terms_accepted_at,
    terms_version
  )
  select
    p_event_id,
    seat.seat_id,
    trim(p_name),
    trim(p_attendee_names[seat.position]),
    lower(trim(p_email)),
    trim(coalesce(p_phone, '')),
    'paid',
    p_order_ref,
    0,
    p_code,
    now(),
    p_privacy_policy_version,
    now(),
    p_terms_version
  from unnest(p_seats) with ordinality as seat(seat_id, position);

  v_remaining := case
    when v_inv.total_quota is null then null
    else v_inv.total_quota - v_used - v_requested
  end;

  update public.st_event_invitations
     set used = case
       when not multi_use then true
       when total_quota is not null then v_remaining <= 0
       else used
     end
   where id = v_inv.id;

  return jsonb_build_object(
    'order_ref', p_order_ref,
    'used', v_used + v_requested,
    'remaining', v_remaining
  );
exception
  when unique_violation then
    raise exception 'Una de las sillas seleccionadas acaba de ser ocupada. Elige otra.';
end;
$$;

create or replace function public.st_record_checkin_v2(
  p_event_id text,
  p_qr_code text,
  p_seat_ids text[],
  p_operator text,
  p_action text
)
returns table (
  reservation_id uuid,
  seat_id text,
  checked_in_at timestamptz,
  checked_in_by text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_action not in ('checkin', 'undo') then
    raise exception 'Acción de ingreso inválida';
  end if;

  if coalesce(array_length(p_seat_ids, 1), 0) = 0 then
    return;
  end if;

  if p_action = 'checkin' then
    return query
    with changed as (
      update public.st_event_reservations as r
         set checked_in_at = now(),
             checked_in_by = left(p_operator, 80)
       where r.event_id = p_event_id
         and r.qr_code = p_qr_code
         and r.seat_id = any(p_seat_ids)
         and r.payment_status = 'paid'
         and r.checked_in_at is null
      returning r.id, r.event_id, r.qr_code, r.seat_id,
        r.checked_in_at, r.checked_in_by
    ), logged as (
      insert into public.st_ticket_checkin_events (
        reservation_id, event_id, qr_code, seat_id, action, operator_name
      )
      select c.id, c.event_id, c.qr_code, c.seat_id, 'checked_in', c.checked_in_by
        from changed as c
      returning reservation_id
    )
    select c.id, c.seat_id, c.checked_in_at, c.checked_in_by
      from changed as c
      join logged as l on l.reservation_id = c.id;
  else
    return query
    with changed as (
      update public.st_event_reservations as r
         set checked_in_at = null,
             checked_in_by = null
       where r.event_id = p_event_id
         and r.qr_code = p_qr_code
         and r.seat_id = any(p_seat_ids)
         and r.payment_status = 'paid'
         and r.checked_in_at is not null
      returning r.id, r.event_id, r.qr_code, r.seat_id
    ), logged as (
      insert into public.st_ticket_checkin_events (
        reservation_id, event_id, qr_code, seat_id, action, operator_name
      )
      select c.id, c.event_id, c.qr_code, c.seat_id, 'reverted', left(p_operator, 80)
        from changed as c
      returning reservation_id
    )
    select c.id, c.seat_id, null::timestamptz, null::text
      from changed as c
      join logged as l on l.reservation_id = c.id;
  end if;
end;
$$;

create or replace function public.st_apply_bold_webhook(
  p_provider_event_id text,
  p_event_id text,
  p_event_type text,
  p_payment_reference text,
  p_payment_id text,
  p_amount integer,
  p_currency text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audit_id uuid;
  v_result jsonb;
  v_type text := upper(trim(coalesce(p_event_type, '')));
  v_expected integer;
  v_seats integer;
  v_pending integer;
  v_status text;
begin
  insert into public.st_payment_webhook_events (
    provider_event_id,
    event_id,
    event_type,
    payment_reference,
    payment_id,
    amount,
    currency,
    payload
  ) values (
    p_provider_event_id,
    p_event_id,
    v_type,
    p_payment_reference,
    p_payment_id,
    p_amount,
    upper(p_currency),
    p_payload
  )
  on conflict (provider_event_id) do nothing
  returning id into v_audit_id;

  if v_audit_id is null then
    select result
      into v_result
      from public.st_payment_webhook_events
     where provider_event_id = p_provider_event_id;

    return coalesce(v_result, jsonb_build_object('status', 'processing'))
      || jsonb_build_object('duplicate', true);
  end if;

  -- Keep the audit row outside this inner exception block. If processing fails,
  -- PostgreSQL rolls back only the business changes and the failure remains logged.
  begin
  if nullif(trim(coalesce(p_payment_reference, '')), '') is null then
    v_status := 'invalid_reference';
    v_result := jsonb_build_object('status', v_status, 'duplicate', false);
  elsif v_type in ('SALE_APPROVED', 'PAYMENT_APPROVED') then
    select count(*)::integer,
           count(*) filter (where payment_status = 'pending')::integer,
           coalesce(sum(amount), 0)::integer
      into v_seats, v_pending, v_expected
      from public.st_event_reservations
     where event_id = p_event_id
       and (bold_reference = p_payment_reference or qr_code = p_payment_reference)
       and payment_status in ('pending', 'paid');

    if v_seats = 0 then
      v_status := 'unmatched';
      v_result := jsonb_build_object('status', v_status, 'duplicate', false);
    elsif upper(coalesce(p_currency, '')) <> 'COP' or p_amount is distinct from v_expected then
      v_status := 'amount_mismatch';
      v_result := jsonb_build_object(
        'status', v_status,
        'duplicate', false,
        'expectedAmount', v_expected,
        'receivedAmount', p_amount,
        'receivedCurrency', upper(coalesce(p_currency, ''))
      );
    else
      update public.st_event_reservations
         set payment_status = 'paid',
             bold_payment_id = coalesce(nullif(p_payment_id, ''), bold_payment_id),
             bold_paid_at = coalesce(bold_paid_at, now()),
             hold_expires_at = null
       where event_id = p_event_id
         and (bold_reference = p_payment_reference or qr_code = p_payment_reference)
         and payment_status = 'pending';

      v_status := 'paid';
      v_result := jsonb_build_object(
        'status', v_status,
        'duplicate', v_pending = 0,
        'seats', v_seats,
        'expectedAmount', v_expected
      );
    end if;
  elsif v_type in ('SALE_REJECTED', 'PAYMENT_REJECTED', 'PAYMENT_ERROR') then
    update public.st_event_reservations
       set payment_status = 'cancelled',
           hold_expires_at = null
     where event_id = p_event_id
       and (bold_reference = p_payment_reference or qr_code = p_payment_reference)
       and payment_status = 'pending';

    get diagnostics v_seats = row_count;
    v_status := case when v_seats > 0 then 'cancelled' else 'unmatched' end;
    v_result := jsonb_build_object('status', v_status, 'duplicate', false, 'seats', v_seats);
  elsif v_type = 'VOID_APPROVED' then
    update public.st_event_reservations
       set payment_status = 'cancelled',
           hold_expires_at = null
     where event_id = p_event_id
       and (bold_reference = p_payment_reference or qr_code = p_payment_reference)
       and payment_status in ('pending', 'paid');

    get diagnostics v_seats = row_count;
    v_status := case when v_seats > 0 then 'voided' else 'unmatched' end;
    v_result := jsonb_build_object('status', v_status, 'duplicate', false, 'seats', v_seats);
  else
    v_status := 'ignored';
    v_result := jsonb_build_object('status', v_status, 'duplicate', false, 'eventType', v_type);
  end if;

  update public.st_payment_webhook_events
     set status = v_status,
         result = v_result,
         processed_at = now(),
         notification_status = case when v_status = 'paid' then 'pending' else 'not_required' end
   where id = v_audit_id;

  return v_result;
  exception
    when others then
      update public.st_payment_webhook_events
         set status = 'error',
             result = jsonb_build_object('status', 'error'),
             processed_at = now()
       where id = v_audit_id;
      return jsonb_build_object('status', 'error', 'duplicate', false, 'message', sqlerrm);
  end;
end;
$$;

revoke all on function public.st_reserve_invitation(
  text, text, text[], text[], text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.st_record_checkin_v2(text, text, text[], text, text)
  from public, anon, authenticated;
revoke all on function public.st_apply_bold_webhook(
  text, text, text, text, text, integer, text, jsonb
) from public, anon, authenticated;

grant execute on function public.st_reserve_invitation(
  text, text, text[], text[], text, text, text, text, text, text
) to service_role;
grant execute on function public.st_record_checkin_v2(text, text, text[], text, text)
  to service_role;
grant execute on function public.st_apply_bold_webhook(
  text, text, text, text, text, integer, text, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
