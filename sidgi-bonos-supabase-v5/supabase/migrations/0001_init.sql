-- ============================================================
-- SIDGI Bonos — 0001_init.sql
-- Esquema base multiempresa. Ejecutar primero.
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- restricción de exclusión (anti-solapes)

-- ------------------------------------------------------------
-- organizations / organization_users
-- ------------------------------------------------------------

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create table if not exists organization_users (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'staff' check (role in ('owner','staff')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_org_users_user on organization_users(user_id);

-- ------------------------------------------------------------
-- clients
-- ------------------------------------------------------------

create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  phone             text,
  phone_normalized  text,           -- últimos 9 dígitos, sin espacios/prefijo
  notes             text default '',
  created_at        timestamptz not null default now()
);
create index if not exists idx_clients_org on clients(organization_id);
create index if not exists idx_clients_org_phone on clients(organization_id, phone_normalized);

-- ------------------------------------------------------------
-- services (servicios reservables — citas, NO bonos)
-- ------------------------------------------------------------

create table if not exists services (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  duration_min      int  not null check (duration_min > 0),
  price             numeric(10,2),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists idx_services_org on services(organization_id);

-- ------------------------------------------------------------
-- bonus_types (producto prepago) y client_bonuses (venta concreta)
-- ------------------------------------------------------------

create table if not exists bonus_types (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  sessions          int  not null check (sessions > 0),
  price             numeric(10,2) not null check (price >= 0),
  expiry_months     int,
  archived          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_bonus_types_org on bonus_types(organization_id);

create table if not exists client_bonuses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  bonus_type_id     uuid references bonus_types(id) on delete set null,
  name              text not null,             -- copiado del tipo en el momento de la venta
  sessions_total    int  not null check (sessions_total > 0),
  price             numeric(10,2) not null check (price >= 0),
  purchase_date     date not null default current_date,
  expiry_date       date,
  payment_method    text,
  canceled          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_client_bonuses_org on client_bonuses(organization_id);
create index if not exists idx_client_bonuses_client on client_bonuses(client_id);

-- ------------------------------------------------------------
-- bonus_sessions (sesión consumida — nunca factura)
-- ------------------------------------------------------------

create table if not exists bonus_sessions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  bonus_id          uuid not null references client_bonuses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  session_date      date not null default current_date,
  note              text default '',
  created_at        timestamptz not null default now()
);
create index if not exists idx_bonus_sessions_bonus on bonus_sessions(bonus_id);
create index if not exists idx_bonus_sessions_org on bonus_sessions(organization_id);

-- ------------------------------------------------------------
-- appointments (agenda) — con protección de solapes en el propio esquema
-- ------------------------------------------------------------

create table if not exists appointments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  date              date not null,
  start_time        time not null,
  duration_min      int  not null check (duration_min > 0),
  service_name      text,
  note              text default '',
  status            text not null default 'active' check (status in ('active','cancelled')),
  origin            text not null default 'admin' check (origin in ('admin','online')),
  reminder_sent      boolean not null default false,
  token             text unique,                -- enlace público de gestión (solo citas online)
  created_at        timestamptz not null default now(),
  -- columnas generadas para poder comparar intervalos con GiST
  starts_at         timestamp generated always as ( (date + start_time) ) stored,
  ends_at           timestamp generated always as ( (date + start_time) + make_interval(mins => duration_min) ) stored
);
create index if not exists idx_appointments_org_date on appointments(organization_id, date);
create index if not exists idx_appointments_client on appointments(client_id);

-- Impide solapes de citas ACTIVAS de la misma empresa a nivel de base de datos.
-- Esto protege incluso frente a dos reservas simultáneas desde dispositivos distintos.
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    organization_id with =,
    tsrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active');

-- ------------------------------------------------------------
-- blocked_periods (horas puntuales bloqueadas: comida, formación...)
-- ------------------------------------------------------------

create table if not exists blocked_periods (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  date              date not null,
  start_time        time not null,
  end_time          time not null check (end_time > start_time),
  reason            text default '',
  created_at        timestamptz not null default now()
);
create index if not exists idx_blocked_periods_org_date on blocked_periods(organization_id, date);

-- ------------------------------------------------------------
-- closed_days (día completo cerrado: vacaciones, festivos)
-- ------------------------------------------------------------

create table if not exists closed_days (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  date              date not null,
  reason            text default '',
  created_at        timestamptz not null default now(),
  unique (organization_id, date)
);
create index if not exists idx_closed_days_org_date on closed_days(organization_id, date);

-- ------------------------------------------------------------
-- transactions (facturación unificada: venta de bono, servicio suelto, devolución)
-- ------------------------------------------------------------

create table if not exists transactions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  client_id         uuid references clients(id) on delete set null,
  kind              text not null check (kind in ('bonus_sale','service','refund')),
  concept           text not null,
  amount            numeric(10,2) not null check (amount >= 0), -- siempre positivo; el signo lo da "kind"
  payment_method    text,
  date              date not null default current_date,
  related_bonus_id  uuid references client_bonuses(id) on delete set null,
  note              text default '',
  created_at        timestamptz not null default now()
);
create index if not exists idx_transactions_org_date on transactions(organization_id, date);
create index if not exists idx_transactions_bonus on transactions(related_bonus_id);

-- ------------------------------------------------------------
-- business_settings (uno por empresa)
-- ------------------------------------------------------------

create table if not exists business_settings (
  organization_id             uuid primary key references organizations(id) on delete cascade,
  business_name               text not null default '',
  phone                       text default '',
  address                     text default '',
  weekly_hours                jsonb not null default '{
    "0": {"open": false, "from": "09:00", "to": "14:00"},
    "1": {"open": true,  "from": "09:00", "to": "19:00"},
    "2": {"open": true,  "from": "09:00", "to": "19:00"},
    "3": {"open": true,  "from": "09:00", "to": "19:00"},
    "4": {"open": true,  "from": "09:00", "to": "19:00"},
    "5": {"open": true,  "from": "09:00", "to": "19:00"},
    "6": {"open": false, "from": "09:00", "to": "14:00"}
  }'::jsonb,
  default_appointment_duration int not null default 60,
  whatsapp_message            text not null default 'Hola {cliente}, te recordamos tu cita en {negocio} el {fecha} a las {hora} para {servicio}. Si no puedes venir, avísanos. ¡Te esperamos!',
  reminder_auto_prepare       boolean not null default false,
  updated_at                  timestamptz not null default now()
);
