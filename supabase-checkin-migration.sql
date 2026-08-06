begin;

alter table mundo_de_javi.reservations
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by text;

create index if not exists idx_reservations_event_checkin
  on mundo_de_javi.reservations (event_id, checked_in_at)
  where payment_status = 'paid';

create table if not exists mundo_de_javi.ticket_checkin_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references mundo_de_javi.reservations(id) on delete set null,
  event_id text not null,
  qr_code text not null,
  seat_id text not null,
  action text not null check (action in ('checked_in', 'reverted')),
  operator_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_checkin_events_event_created
  on mundo_de_javi.ticket_checkin_events (event_id, created_at desc);

alter table mundo_de_javi.reservations enable row level security;
alter table mundo_de_javi.ticket_checkin_events enable row level security;

revoke all on table mundo_de_javi.reservations from anon, authenticated;
revoke all on table mundo_de_javi.ticket_checkin_events from anon, authenticated;
grant usage on schema mundo_de_javi to service_role;
grant all on table mundo_de_javi.reservations to service_role;
grant all on table mundo_de_javi.ticket_checkin_events to service_role;

create or replace view public.reservations
with (security_invoker = true)
as
select
  id,
  event_id,
  seat_id,
  customer_name,
  customer_email,
  customer_phone,
  payment_status,
  qr_code,
  amount,
  created_at,
  bold_reference,
  invitation_code,
  attendee_name,
  hold_expires_at,
  checked_in_at,
  checked_in_by
from mundo_de_javi.reservations;

revoke all on table public.reservations from anon, authenticated;
grant all on table public.reservations to service_role;

create or replace function public.st_record_checkin(
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
    raise exception 'Unsupported check-in action';
  end if;

  if coalesce(array_length(p_seat_ids, 1), 0) = 0 then
    return;
  end if;

  if p_action = 'checkin' then
    return query
    with changed as (
      update mundo_de_javi.reservations as r
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
      insert into mundo_de_javi.ticket_checkin_events as e (
        reservation_id, event_id, qr_code, seat_id, action, operator_name
      )
      select c.id, c.event_id, c.qr_code, c.seat_id, 'checked_in', c.checked_in_by
      from changed as c
      returning e.reservation_id
    )
    select c.id, c.seat_id, c.checked_in_at, c.checked_in_by
    from changed as c
    join logged as l on l.reservation_id = c.id;
  else
    return query
    with changed as (
      update mundo_de_javi.reservations as r
      set checked_in_at = null,
          checked_in_by = null
      where r.event_id = p_event_id
        and r.qr_code = p_qr_code
        and r.seat_id = any(p_seat_ids)
        and r.payment_status = 'paid'
        and r.checked_in_at is not null
      returning r.id, r.event_id, r.qr_code, r.seat_id
    ), logged as (
      insert into mundo_de_javi.ticket_checkin_events as e (
        reservation_id, event_id, qr_code, seat_id, action, operator_name
      )
      select c.id, c.event_id, c.qr_code, c.seat_id, 'reverted', left(p_operator, 80)
      from changed as c
      returning e.reservation_id
    )
    select c.id, c.seat_id, null::timestamptz, null::text
    from changed as c
    join logged as l on l.reservation_id = c.id;
  end if;
end;
$$;

revoke all on function public.st_record_checkin(text, text, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.st_record_checkin(text, text, text[], text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
