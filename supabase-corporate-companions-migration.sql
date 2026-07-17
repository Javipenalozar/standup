-- Track the attendee assigned to each seat in corporate reservations.

alter table public.reservations
  add column if not exists attendee_name text;

create or replace function public.reserve_corporate_invitation_v2(
  p_code text,
  p_event_id text,
  p_seats text[],
  p_attendee_names text[],
  p_name text,
  p_email text,
  p_phone text,
  p_order_ref text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_used integer;
  v_requested integer;
begin
  select *
    into v_inv
    from public.invitations
   where code = p_code
   for update;

  if not found or v_inv.total_quota is null then
    raise exception 'Código empresarial no válido';
  end if;

  v_requested := cardinality(p_seats);
  if v_requested is null or v_requested < 1 or v_requested > v_inv.max_seats then
    raise exception 'Esta invitación permite máximo % silla(s) por empleado', v_inv.max_seats;
  end if;

  if cardinality(p_attendee_names) is distinct from v_requested or exists (
    select 1
      from unnest(p_attendee_names) as attendee(name)
     where nullif(trim(attendee.name), '') is null
  ) then
    raise exception 'Escribe el nombre de cada asistente';
  end if;

  select count(*)::integer
    into v_used
    from public.reservations
   where invitation_code = p_code
     and payment_status in ('paid', 'pending');

  if v_used + v_requested > v_inv.total_quota then
    raise exception 'No quedan suficientes cupos disponibles para esta empresa';
  end if;

  if exists (
    select 1
      from public.reservations
     where invitation_code = p_code
       and lower(trim(customer_email)) = lower(trim(p_email))
       and payment_status in ('paid', 'pending')
  ) then
    raise exception 'Este correo ya registró entradas con este enlace';
  end if;

  insert into public.reservations (
    event_id,
    seat_id,
    customer_name,
    attendee_name,
    customer_email,
    customer_phone,
    payment_status,
    qr_code,
    amount,
    invitation_code
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
    p_code
  from unnest(p_seats) with ordinality as seat(seat_id, position);

  update public.invitations
     set used = (v_used + v_requested >= total_quota)
   where code = p_code;

  return jsonb_build_object(
    'order_ref', p_order_ref,
    'used', v_used + v_requested,
    'remaining', v_inv.total_quota - v_used - v_requested
  );
exception
  when unique_violation then
    raise exception 'Una de las sillas seleccionadas acaba de ser ocupada. Elige otra.';
end;
$$;

revoke execute on function public.reserve_corporate_invitation_v2(
  text, text, text[], text[], text, text, text, text
) from public, anon, authenticated;

grant execute on function public.reserve_corporate_invitation_v2(
  text, text, text[], text[], text, text, text, text
) to service_role;
