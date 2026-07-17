-- ============================================================
-- SIDGI Bonos — 0002_rls.sql
-- Aísla cada empresa: un usuario solo ve y modifica los datos
-- de las organizaciones a las que pertenece (organization_users).
-- Ejecutar después de 0001_init.sql.
-- ============================================================

-- organization_users: cada usuario solo ve SUS PROPIAS membresías.
-- (Política sin subconsulta a sí misma, para evitar recursión.)
alter table organization_users enable row level security;

create policy org_users_select_own
  on organization_users for select
  using (user_id = auth.uid());

-- No se permite alta/edición/baja de membresías desde el cliente en esta fase;
-- se gestionan manualmente (ver SETUP.md) o vía backend con service_role.

-- ------------------------------------------------------------
-- organizations: visible solo si el usuario pertenece a ella.
-- ------------------------------------------------------------
alter table organizations enable row level security;

create policy organizations_select
  on organizations for select
  using (
    id in (select organization_id from organization_users where user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Macro de políticas repetida por tabla: SELECT/INSERT/UPDATE/DELETE
-- restringidos a organization_id perteneciente al usuario autenticado.
-- ------------------------------------------------------------

-- clients
alter table clients enable row level security;
create policy clients_select on clients for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy clients_insert on clients for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy clients_update on clients for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy clients_delete on clients for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- services
alter table services enable row level security;
create policy services_select on services for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy services_insert on services for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy services_update on services for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy services_delete on services for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- bonus_types
alter table bonus_types enable row level security;
create policy bonus_types_select on bonus_types for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_types_insert on bonus_types for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_types_update on bonus_types for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_types_delete on bonus_types for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- client_bonuses
alter table client_bonuses enable row level security;
create policy client_bonuses_select on client_bonuses for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy client_bonuses_insert on client_bonuses for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy client_bonuses_update on client_bonuses for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy client_bonuses_delete on client_bonuses for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- bonus_sessions
alter table bonus_sessions enable row level security;
create policy bonus_sessions_select on bonus_sessions for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_sessions_insert on bonus_sessions for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_sessions_update on bonus_sessions for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy bonus_sessions_delete on bonus_sessions for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- appointments (el INSERT público NO pasa por aquí: usa la RPC con SECURITY DEFINER)
alter table appointments enable row level security;
create policy appointments_select on appointments for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy appointments_insert on appointments for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy appointments_update on appointments for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy appointments_delete on appointments for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- blocked_periods
alter table blocked_periods enable row level security;
create policy blocked_periods_select on blocked_periods for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy blocked_periods_insert on blocked_periods for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy blocked_periods_update on blocked_periods for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy blocked_periods_delete on blocked_periods for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- closed_days
alter table closed_days enable row level security;
create policy closed_days_select on closed_days for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy closed_days_insert on closed_days for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy closed_days_update on closed_days for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy closed_days_delete on closed_days for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- transactions
alter table transactions enable row level security;
create policy transactions_select on transactions for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy transactions_insert on transactions for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy transactions_update on transactions for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy transactions_delete on transactions for delete
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- business_settings
alter table business_settings enable row level security;
create policy business_settings_select on business_settings for select
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy business_settings_insert on business_settings for insert
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));
create policy business_settings_update on business_settings for update
  using (organization_id in (select organization_id from organization_users where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_users where user_id = auth.uid()));

-- ------------------------------------------------------------
-- Privilegios de tabla (además de las políticas RLS de arriba).
-- En un proyecto Supabase hospedado, estas concesiones ya existen
-- por defecto para "anon"/"authenticated"; se declaran aquí de forma
-- explícita para que el comportamiento sea idéntico en cualquier
-- Postgres y no dependa de configuración implícita de la plataforma.
-- RLS sigue siendo quien decide qué FILAS se ven, no estos GRANT.
-- ------------------------------------------------------------
grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on
  organizations, clients, services, bonus_types, client_bonuses, bonus_sessions,
  appointments, blocked_periods, closed_days, transactions, business_settings
  to authenticated;

grant select on organization_users to authenticated;

-- anon NO recibe privilegios de tabla directos: la página pública solo
-- puede entrar por las funciones RPC (SECURITY DEFINER) de 0003_functions.sql.

-- ------------------------------------------------------------
-- IMPORTANTE: no se conceden políticas para el rol "anon" en NINGUNA
-- de estas tablas. La página pública de reservas nunca lee ni escribe
-- estas tablas directamente: pasa siempre por las funciones RPC de
-- 0003_functions.sql, que son SECURITY DEFINER y exponen solo lo
-- estrictamente necesario (servicios activos, huecos libres, y la
-- propia cita mediante su token secreto).
-- ------------------------------------------------------------
