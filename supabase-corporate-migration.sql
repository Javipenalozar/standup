-- Corporate invitation campaigns with an enforced global quota.

alter table public.invitations
  add column if not exists total_quota integer;

alter table public.invitations
  drop constraint if exists invitations_total_quota_check;

alter table public.invitations
  add constraint invitations_total_quota_check
  check (total_quota is null or total_quota between 1 and 500);

alter table public.reservations
  add column if not exists invitation_code text;

create index if not exists idx_reservations_invitation_code
  on public.reservations (invitation_code)
  where invitation_code is not null;

create or replace function public.reserve_corporate_invitation(
  p_code text,
  p_event_id text,
  p_seats text[],
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
    raise exception 'Esta invitación permite máximo % silla(s) por persona', v_inv.max_seats;
  end if;

  select count(*)::integer
    into v_used
    from public.reservations
   where invitation_code = p_code
     and payment_status in ('paid', 'pending');

  if v_used + v_requested > v_inv.total_quota then
    raise exception 'Ya no quedan cupos disponibles para esta empresa';
  end if;

  if exists (
    select 1
      from public.reservations
     where invitation_code = p_code
       and lower(trim(customer_email)) = lower(trim(p_email))
       and payment_status in ('paid', 'pending')
  ) then
    raise exception 'Este correo ya registró una entrada con este enlace';
  end if;

  insert into public.reservations (
    event_id,
    seat_id,
    customer_name,
    customer_email,
    customer_phone,
    payment_status,
    qr_code,
    amount,
    invitation_code
  )
  select
    p_event_id,
    seat_id,
    trim(p_name),
    lower(trim(p_email)),
    trim(coalesce(p_phone, '')),
    'paid',
    p_order_ref,
    0,
    p_code
  from unnest(p_seats) as seat_id;

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
    raise exception 'La silla seleccionada acaba de ser ocupada. Elige otra.';
end;
$$;

revoke execute on function public.reserve_corporate_invitation(
  text, text, text[], text, text, text, text
) from public, anon, authenticated;

grant execute on function public.reserve_corporate_invitation(
  text, text, text[], text, text, text, text
) to service_role;
