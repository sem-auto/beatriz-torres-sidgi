-- ============================================================
-- SIDGI Bonos — 0003_functions.sql
-- Funciones RPC. Las de uso público (anon) son SECURITY DEFINER
-- y exponen solo lo estrictamente necesario para reservar sin
-- iniciar sesión, sin dar acceso directo a las tablas.
-- Ejecutar después de 0001 y 0002.
-- ============================================================

-- ------------------------------------------------------------
-- Utilidad: normaliza un teléfono a sus últimos 9 dígitos,
-- para que "+34 612 345 002", "612345002" y "612-345-002"
-- se traten como el mismo cliente.
-- ------------------------------------------------------------
create or replace function normalize_phone(p text)
returns text
language sql immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

-- ------------------------------------------------------------
-- my_organization(): para el panel admin tras iniciar sesión.
-- Devuelve la empresa (y rol) del usuario autenticado.
-- MVP: un usuario pertenece a una sola empresa.
-- ------------------------------------------------------------
create or replace function my_organization()
returns table (organization_id uuid, role text, organization_name text)
language sql stable security definer
set search_path = public
as $$
  select ou.organization_id, ou.role, o.name
  from organization_users ou
  join organizations o on o.id = ou.organization_id
  where ou.user_id = auth.uid()
  limit 1
$$;

grant execute on function my_organization() to authenticated;

-- ------------------------------------------------------------
-- get_public_business(org_id): datos mínimos y seguros para la
-- página pública (nombre, teléfono, dirección, horario semanal).
-- ------------------------------------------------------------
create or replace function get_public_business(p_org_id uuid)
returns table (
  business_name text, phone text, address text,
  weekly_hours jsonb, default_appointment_duration int
)
language sql stable security definer
set search_path = public
as $$
  select business_name, phone, address, weekly_hours, default_appointment_duration
  from business_settings
  where organization_id = p_org_id
$$;

grant execute on function get_public_business(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- get_public_services(org_id): servicios activos reservables.
-- ------------------------------------------------------------
create or replace function get_public_services(p_org_id uuid)
returns table (id uuid, name text, duration_min int, price numeric)
language sql stable security definer
set search_path = public
as $$
  select id, name, duration_min, price
  from services
  where organization_id = p_org_id and active = true
  order by name
$$;

grant execute on function get_public_services(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- get_available_slots(org_id, service_id, date):
-- calcula huecos libres cruzando horario + duración + citas +
-- bloqueos + días cerrados + hora actual. Es la MISMA lógica
-- que usa el frontend para pintar, pero aquí es la fuente de
-- verdad que también usa book_appointment_public antes de
-- insertar (server-side, no solo JavaScript).
-- ------------------------------------------------------------
create or replace function get_available_slots(p_org_id uuid, p_service_id uuid, p_date date)
returns table (slot time)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_duration   int;
  v_dow        int;
  v_hours      jsonb;
  v_open       boolean;
  v_from       time;
  v_to         time;
  v_step       int := 30;
  v_slot       time;
  v_now        timestamp := now();
begin
  select duration_min into v_duration from services where id = p_service_id and organization_id = p_org_id and active = true;
  if v_duration is null then
    return; -- servicio inexistente o inactivo: sin huecos
  end if;

  if exists (select 1 from closed_days where organization_id = p_org_id and date = p_date) then
    return; -- día completo cerrado
  end if;

  select weekly_hours into v_hours from business_settings where organization_id = p_org_id;
  v_dow := extract(dow from p_date)::int; -- 0=domingo .. 6=sábado
  v_open := coalesce((v_hours -> v_dow::text ->> 'open')::boolean, false);
  if not v_open then
    return; -- cerrado ese día de la semana
  end if;
  v_from := (v_hours -> v_dow::text ->> 'from')::time;
  v_to   := (v_hours -> v_dow::text ->> 'to')::time;

  v_slot := v_from;
  while v_slot + make_interval(mins => v_duration) <= v_to loop
    if not (p_date = current_date and (p_date + v_slot) <= v_now) then
      if not exists (
        select 1 from appointments a
        where a.organization_id = p_org_id
          and a.status = 'active'
          and tsrange(a.starts_at, a.ends_at, '[)') && tsrange((p_date + v_slot), (p_date + v_slot) + make_interval(mins => v_duration), '[)')
      ) and not exists (
        select 1 from blocked_periods b
        where b.organization_id = p_org_id and b.date = p_date
          and tsrange((b.date + b.start_time), (b.date + b.end_time), '[)') && tsrange((p_date + v_slot), (p_date + v_slot) + make_interval(mins => v_duration), '[)')
      ) then
        slot := v_slot;
        return next;
      end if;
    end if;
    v_slot := v_slot + make_interval(mins => v_step);
  end loop;
end;
$$;

grant execute on function get_available_slots(uuid, uuid, date) to anon, authenticated;

-- ------------------------------------------------------------
-- book_appointment_public(): RESERVA ATÓMICA de verdad.
-- No es "comprobar y luego insertar" desde el navegador: toda
-- la validación y el INSERT ocurren en esta única función, en
-- una sola transacción. Si dos personas reservan el mismo hueco
-- a la vez, la restricción de exclusión de "appointments" (ver
-- 0001_init.sql) hace que la segunda transacción falle aunque
-- ambas hayan pasado la comprobación de huecos libres — no hay
-- ventana de carrera posible.
-- ------------------------------------------------------------
create or replace function book_appointment_public(
  p_org_id       uuid,
  p_service_id   uuid,
  p_date         date,
  p_time         time,
  p_client_name  text,
  p_client_phone text,
  p_note         text default ''
)
returns table (
  appointment_id uuid, token text, client_id uuid,
  service_name text, duration_min int, date date, start_time time
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_duration     int;
  v_service_name text;
  v_phone_norm   text;
  v_client_id    uuid;
  v_appt_id      uuid;
  v_token        text;
begin
  if p_client_name is null or btrim(p_client_name) = '' then
    raise exception 'Falta el nombre.' using errcode = 'P0001';
  end if;

  v_phone_norm := normalize_phone(p_client_phone);
  if length(v_phone_norm) < 9 then
    raise exception 'Revisa el teléfono (9 dígitos).' using errcode = 'P0001';
  end if;

  select s.name, s.duration_min into v_service_name, v_duration
  from services s where s.id = p_service_id and s.organization_id = p_org_id and s.active = true;
  if v_duration is null then
    raise exception 'El servicio ya no está disponible.' using errcode = 'P0001';
  end if;

  -- Revalidación server-side del hueco (misma función que pinta la disponibilidad)
  if not exists (select 1 from get_available_slots(p_org_id, p_service_id, p_date) s where s.slot = p_time) then
    raise exception 'Esa hora acaba de ocuparse. Elige otra, por favor.' using errcode = 'P0002';
  end if;

  -- Vincular con cliente existente por teléfono, o crear uno nuevo
  select id into v_client_id
  from clients
  where organization_id = p_org_id and phone_normalized = v_phone_norm
  limit 1;

  if v_client_id is null then
    insert into clients (organization_id, name, phone, phone_normalized, notes)
    values (p_org_id, btrim(p_client_name), p_client_phone, v_phone_norm, '')
    returning id into v_client_id;
  end if;

  v_token := encode(gen_random_bytes(6), 'hex');

  -- Si otra reserva concurrente ya ocupó el hueco entre la comprobación de
  -- arriba y este INSERT, la restricción "appointments_no_overlap" lanzará
  -- excepción exclusion_violation y la capturamos con un mensaje claro.
  begin
    insert into appointments (
      organization_id, client_id, date, start_time, duration_min,
      service_name, note, status, origin, token
    ) values (
      p_org_id, v_client_id, p_date, p_time, v_duration,
      v_service_name, coalesce(p_note, ''), 'active', 'online', v_token
    )
    returning id into v_appt_id;
  exception when exclusion_violation then
    raise exception 'Esa hora acaba de ocuparse. Elige otra, por favor.' using errcode = 'P0002';
  end;

  return query select v_appt_id, v_token, v_client_id, v_service_name, v_duration, p_date, p_time;
end;
$$;

grant execute on function book_appointment_public(uuid, uuid, date, time, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- get_appointment_by_token / cancel_appointment_by_token:
-- la página de gestión pública (reserva.html) nunca consulta la
-- tabla directamente — solo puede ver/cancelar la cita si conoce
-- el token secreto, que actúa como capacidad de acceso.
-- ------------------------------------------------------------
create or replace function get_appointment_by_token(p_token text)
returns table (
  appointment_id uuid, status text, date date, start_time time,
  duration_min int, service_name text, organization_name text,
  organization_phone text, organization_address text
)
language sql stable security definer
set search_path = public
as $$
  select a.id, a.status, a.date, a.start_time, a.duration_min, a.service_name,
         bs.business_name, bs.phone, bs.address
  from appointments a
  join business_settings bs on bs.organization_id = a.organization_id
  where a.token = p_token
$$;

grant execute on function get_appointment_by_token(text) to anon, authenticated;

create or replace function cancel_appointment_by_token(p_token text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update appointments set status = 'cancelled'
  where token = p_token and status = 'active';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function cancel_appointment_by_token(text) to anon, authenticated;
