-- Flujo administrativo para registrar transferencias verificadas y emitir tickets.
-- Ejecutar una sola vez en el proyecto Supabase del evento.

begin;

create table if not exists public.st_event_transfer_payments (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  receipt_reference text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'COP' check (currency = 'COP'),
  received_at timestamptz not null,
  recorded_by text not null,
  created_at timestamptz not null default now(),
  unique (event_id, receipt_reference)
);

alter table public.st_event_reservations
  add column if not exists manual_payment_id uuid
    references public.st_event_transfer_payments(id),
  add column if not exists consent_recorded_by text;

alter table public.st_event_transfer_payments enable row level security;
revoke all on table public.st_event_transfer_payments from public, anon, authenticated;
grant select, insert on table public.st_event_transfer_payments to service_role;

create or replace function public.st_create_manual_transfer_reservations(
  p_event_id text,
  p_receipt_reference text,
  p_amount integer,
  p_received_at timestamptz,
  p_recorded_by text,
  p_attendees jsonb,
  p_privacy_policy_version text,
  p_terms_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reference text := upper(trim(coalesce(p_receipt_reference, '')));
  v_operator text := trim(coalesce(p_recorded_by, ''));
  v_count integer;
  v_amount_sum integer;
  v_payment_id uuid;
  v_attendee jsonb;
  v_qr_code text;
  v_reservation_id uuid;
  v_tickets jsonb := '[]'::jsonb;
begin
  if p_event_id is distinct from 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026' then
    raise exception 'El evento no corresponde a esta operación';
  end if;

  if length(v_reference) < 4 or length(v_reference) > 100 then
    raise exception 'Escribe una referencia válida del comprobante';
  end if;
  if p_amount is null or p_amount <= 0 or p_received_at is null then
    raise exception 'Faltan el valor o la fecha de la transferencia';
  end if;
  if p_received_at > now() + interval '15 minutes' or p_received_at < now() - interval '365 days' then
    raise exception 'La fecha del pago no es válida';
  end if;
  if length(v_operator) < 2 or length(v_operator) > 120 then
    raise exception 'Escribe el nombre de quien registra el pago';
  end if;
  if jsonb_typeof(p_attendees) is distinct from 'array'
     or jsonb_array_length(p_attendees) not between 1 and 10 then
    raise exception 'Registra entre 1 y 10 asistentes';
  end if;
  if nullif(trim(coalesce(p_privacy_policy_version, '')), '') is null
     or nullif(trim(coalesce(p_terms_version, '')), '') is null then
    raise exception 'Falta la versión de los términos o de privacidad';
  end if;

  v_count := jsonb_array_length(p_attendees);

  if exists (
    select 1
      from jsonb_array_elements(p_attendees) as item(value)
     where nullif(trim(coalesce(item.value->>'seat_id', '')), '') is null
        or (item.value->>'seat_id') !~ '^([A-J]-([1-9]|1[0-9]|2[0-2])|K-([1-9]|1[0-9]))$'
        or length(trim(coalesce(item.value->>'customer_name', ''))) not between 2 and 120
        or length(trim(coalesce(item.value->>'customer_email', ''))) not between 5 and 254
        or (item.value->>'customer_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        or length(trim(coalesce(item.value->>'customer_phone', ''))) not between 7 and 32
        or coalesce(item.value->'privacy_accepted', 'false'::jsonb) <> 'true'::jsonb
        or coalesce(item.value->'terms_accepted', 'false'::jsonb) <> 'true'::jsonb
        or coalesce(item.value->>'amount', '') !~ '^[0-9]+$'
        or (item.value->>'amount')::integer <= 0
  ) then
    raise exception 'Revisa los datos y las aceptaciones de cada asistente';
  end if;

  if (select count(distinct upper(value->>'seat_id')) from jsonb_array_elements(p_attendees)) <> v_count then
    raise exception 'No repitas sillas';
  end if;

  select sum((value->>'amount')::integer)::integer
    into v_amount_sum
    from jsonb_array_elements(p_attendees);
  if v_amount_sum is distinct from p_amount then
    raise exception 'El valor del comprobante no coincide con las sillas';
  end if;

  insert into public.st_event_transfer_payments (
    event_id, receipt_reference, amount, received_at, recorded_by
  ) values (
    p_event_id, v_reference, p_amount, p_received_at, v_operator
  ) returning id into v_payment_id;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    v_qr_code := 'ST-' || upper(encode(extensions.gen_random_bytes(4), 'hex')) || '-' ||
      upper(encode(extensions.gen_random_bytes(4), 'hex'));

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
      manual_payment_id,
      privacy_consent_at,
      privacy_policy_version,
      terms_accepted_at,
      terms_version,
      consent_recorded_by
    ) values (
      p_event_id,
      upper(trim(v_attendee->>'seat_id')),
      trim(v_attendee->>'customer_name'),
      trim(v_attendee->>'customer_name'),
      lower(trim(v_attendee->>'customer_email')),
      trim(v_attendee->>'customer_phone'),
      'paid',
      v_qr_code,
      (v_attendee->>'amount')::integer,
      v_payment_id,
      now(),
      p_privacy_policy_version,
      now(),
      p_terms_version,
      v_operator
    ) returning id into v_reservation_id;

    v_tickets := v_tickets || jsonb_build_array(jsonb_build_object(
      'reservation_id', v_reservation_id,
      'seat_id', upper(trim(v_attendee->>'seat_id')),
      'customer_name', trim(v_attendee->>'customer_name'),
      'customer_email', lower(trim(v_attendee->>'customer_email')),
      'qr_code', v_qr_code,
      'amount', (v_attendee->>'amount')::integer
    ));
  end loop;

  return jsonb_build_object(
    'manual_payment_id', v_payment_id,
    'receipt_reference', v_reference,
    'amount', p_amount,
    'tickets', v_tickets
  );
end;
$$;

revoke all on function public.st_create_manual_transfer_reservations(
  text, text, integer, timestamptz, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.st_create_manual_transfer_reservations(
  text, text, integer, timestamptz, text, jsonb, text, text
) to service_role;

commit;
