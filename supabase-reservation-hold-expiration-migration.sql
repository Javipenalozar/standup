alter table public.reservations
  add column if not exists hold_expires_at timestamptz;

create index if not exists reservations_pending_hold_expiry_idx
  on public.reservations (hold_expires_at)
  where payment_status = 'pending' and hold_expires_at is not null;
