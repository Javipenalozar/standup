-- Tabla de reservaciones para Stand-Up Therapy
-- Ejecuta este SQL en tu dashboard de Supabase > SQL Editor

create table if not exists reservations (
  id uuid default gen_random_uuid() primary key,
  event_id text not null,
  seat_id text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'cancelled')),
  qr_code text not null,
  amount integer not null,
  created_at timestamptz default now()
);

-- Evita que dos personas reserven la misma silla
create unique index if not exists idx_reservations_event_seat
  on reservations (event_id, seat_id)
  where payment_status in ('paid', 'pending');

-- Permite leer reservaciones desde el frontend (solo seat_id para el mapa)
alter table reservations enable row level security;

create policy "Anyone can read seat_id for event"
  on reservations for select
  using (true);

create policy "Anyone can insert reservations"
  on reservations for insert
  with check (true);
