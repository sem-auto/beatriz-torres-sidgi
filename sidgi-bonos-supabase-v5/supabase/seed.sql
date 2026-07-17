-- ============================================================
-- SIDGI Bonos — seed.sql
-- Datos ficticios de demostración para el piloto de Beatriz Torres.
-- Ningún dato real de clientas. Ejecutar después de las 3 migraciones.
--
-- IMPORTANTE: este script crea la EMPRESA y sus datos, pero no puede
-- crear el usuario de acceso (auth.users pertenece a Supabase Auth,
-- no se manipula por SQL directo). Sigue SETUP.md para crear a
-- Beatriz como usuaria y vincularla con el UPDATE que se indica al
-- final de este archivo.
-- ============================================================

do $$
declare
  v_org_id      uuid := gen_random_uuid();
  v_t5          uuid := gen_random_uuid();
  v_t10         uuid := gen_random_uuid();
  v_s_dietetica uuid := gen_random_uuid();
  v_s_estetica  uuid := gen_random_uuid();
  v_s_madero    uuid := gen_random_uuid();
  v_s_imodel    uuid := gen_random_uuid();

  -- clientas ficticias
  v_c_laura     uuid := gen_random_uuid();
  v_c_carmen    uuid := gen_random_uuid();
  v_c_nuria     uuid := gen_random_uuid();
  v_c_marisa    uuid := gen_random_uuid();
  v_c_pilar     uuid := gen_random_uuid();
  v_c_teresa    uuid := gen_random_uuid();
  v_c_rosa      uuid := gen_random_uuid();
  v_c_sofia     uuid := gen_random_uuid();
  v_c_veronica  uuid := gen_random_uuid();
  v_c_gloria    uuid := gen_random_uuid();

  -- bonos de ejemplo
  v_b_laura     uuid := gen_random_uuid();
  v_b_carmen1   uuid := gen_random_uuid();
  v_b_carmen2   uuid := gen_random_uuid();
  v_b_nuria     uuid := gen_random_uuid();
  v_b_marisa    uuid := gen_random_uuid();
  v_b_pilar     uuid := gen_random_uuid();
  v_b_sofia     uuid := gen_random_uuid();
  v_b_gloria    uuid := gen_random_uuid();

  v_hoy         date := current_date;
begin
  -- --------------------------------------------------------
  -- Empresa y ajustes (lunes a viernes; sábado y domingo cerrados)
  -- --------------------------------------------------------
  insert into organizations (id, name, phone, address)
  values (v_org_id, 'Beatriz Torres', '605 029 855', 'Avda. Blasco Ibáñez, 32 Pta. 2 · 46389 Turís (Valencia)');

  insert into business_settings (organization_id, business_name, phone, address, default_appointment_duration)
  values (v_org_id, 'Beatriz Torres', '605 029 855', 'Avda. Blasco Ibáñez, 32 Pta. 2 · 46389 Turís (Valencia)', 60);
  -- weekly_hours ya trae por defecto L-V abierto y S-D cerrado (ver 0001_init.sql)

  -- --------------------------------------------------------
  -- Servicios reservables (citas concretas, no bonos)
  -- --------------------------------------------------------
  insert into services (id, organization_id, name, duration_min, price, active) values
    (v_s_dietetica, v_org_id, 'Dietética',        60, null, true),
    (v_s_estetica,  v_org_id, 'Estética general',  60, null, true),
    (v_s_madero,    v_org_id, 'Maderoterapia',     45, null, true),
    (v_s_imodel,    v_org_id, 'i-Model',           60, null, true);

  -- --------------------------------------------------------
  -- Tipos de bono — únicamente i-Model
  -- --------------------------------------------------------
  insert into bonus_types (id, organization_id, name, sessions, price, expiry_months, archived) values
    (v_t5,  v_org_id, 'Bono 5 sesiones i-Model',  5,  200, 6,  false),
    (v_t10, v_org_id, 'Bono 10 sesiones i-Model', 10, 380, 12, false);

  -- --------------------------------------------------------
  -- Clientas ficticias
  -- --------------------------------------------------------
  insert into clients (id, organization_id, name, phone, phone_normalized, notes, created_at) values
    (v_c_laura,    v_org_id, 'Laura Gómez',     '611 200 101', '611200101', '',                              now() - interval '90 days'),
    (v_c_carmen,   v_org_id, 'Carmen Ibáñez',   '611 200 102', '611200102', '',                              now() - interval '220 days'),
    (v_c_nuria,    v_org_id, 'Nuria Sanchis',   '611 200 103', '611200103', '',                              now() - interval '180 days'),
    (v_c_marisa,   v_org_id, 'Marisa Alberola', '611 200 104', '611200104', 'Prefiere horario de tarde',     now() - interval '260 days'),
    (v_c_pilar,    v_org_id, 'Pilar Domenech',  '611 200 105', '611200105', '',                              now() - interval '400 days'),
    (v_c_teresa,   v_org_id, 'Teresa Bataller', '611 200 106', '611200106', '',                              now() - interval '150 days'),
    (v_c_rosa,     v_org_id, 'Rosa Furió',      '611 200 107', '611200107', '',                              now() - interval '90 days'),
    (v_c_sofia,    v_org_id, 'Sofía Peris',     '611 200 108', '611200108', '',                              now() - interval '30 days'),
    (v_c_veronica, v_org_id, 'Verónica Calatayud', '611 200 109', '611200109', '',                           now() - interval '3 days'),
    (v_c_gloria,   v_org_id, 'Gloria Micó',     '611 200 110', '611200110', '',                              now() - interval '200 days');

  -- --------------------------------------------------------
  -- Bonos vendidos, en distintos estados (activo/agotado/caducado/cancelado)
  -- --------------------------------------------------------

  -- Laura: queda 1 sesión (activo, "por terminar")
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_laura, v_org_id, v_c_laura, v_t10, 'Bono 10 sesiones i-Model', 10, 380, v_hoy - 70, v_hoy + 295, 'Tarjeta', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_laura, v_c_laura, v_hoy - (65 - round(65.0/8*n))::int
  from generate_series(0,7) n;
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  values (v_org_id, v_b_laura, v_c_laura, v_hoy); -- 9ª, hoy → queda 1

  -- Carmen: agotado antiguo + bono nuevo activo (recompra)
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_carmen1, v_org_id, v_c_carmen, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy - 220, v_hoy - 40, 'Efectivo', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_carmen1, v_c_carmen, v_hoy - (210 - round(180.0/4*n))::int from generate_series(0,4) n;

  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_carmen2, v_org_id, v_c_carmen, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy - 12, v_hoy + 168, 'Efectivo', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date) values (v_org_id, v_b_carmen2, v_c_carmen, v_hoy - 5);

  -- Nuria: bono activo normal, quedan varias
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_nuria, v_org_id, v_c_nuria, v_t10, 'Bono 10 sesiones i-Model', 10, 380, v_hoy - 22, v_hoy + 343, 'Tarjeta', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_nuria, v_c_nuria, v_hoy - (18 - round(11.0/1*n))::int from generate_series(0,1) n;

  -- Marisa: CADUCADO con sesiones sin usar
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_marisa, v_org_id, v_c_marisa, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy - 240, v_hoy - 60, 'Tarjeta', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_marisa, v_c_marisa, v_hoy - (230 - round(40.0/2*n))::int from generate_series(0,2) n;

  -- Pilar: CANCELADO con devolución
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_pilar, v_org_id, v_c_pilar, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy - 60, v_hoy + 120, 'Tarjeta', true);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_pilar, v_c_pilar, v_hoy - (55 - round(15.0/1*n))::int from generate_series(0,1) n;
  insert into transactions (organization_id, client_id, kind, concept, amount, payment_method, date, related_bonus_id, note)
  values (v_org_id, v_c_pilar, 'refund', 'Devolución · Bono 5 sesiones i-Model', 120, 'Tarjeta', v_hoy - 15, v_b_pilar, 'Cancelación · 3 sesiones sin usar');

  -- Sofía: bono vendido HOY (factura hoy)
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_sofia, v_org_id, v_c_sofia, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy, v_hoy + 180, 'Bizum', false);

  -- Verónica: cliente reciente sin actividad de bonos

  -- Rosa: sin bono, servicios sueltos
  insert into transactions (organization_id, client_id, kind, concept, amount, payment_method, date, note)
  values
    (v_org_id, v_c_rosa, 'service', 'Estética general', 35, 'Tarjeta',  v_hoy - 20, ''),
    (v_org_id, v_c_rosa, 'service', 'Maderoterapia',     40, 'Efectivo', v_hoy - 6, '');

  -- Gloria: bono agotado antiguo + servicio suelto HOY
  insert into client_bonuses (id, organization_id, client_id, bonus_type_id, name, sessions_total, price, purchase_date, expiry_date, payment_method, canceled)
  values (v_b_gloria, v_org_id, v_c_gloria, v_t5, 'Bono 5 sesiones i-Model', 5, 200, v_hoy - 150, v_hoy + 30, 'Efectivo', false);
  insert into bonus_sessions (organization_id, bonus_id, client_id, session_date)
  select v_org_id, v_b_gloria, v_c_gloria, v_hoy - (140 - round(45.0/4*n))::int from generate_series(0,4) n;
  insert into transactions (organization_id, client_id, kind, concept, amount, payment_method, date, note)
  values (v_org_id, v_c_gloria, 'service', 'Dietética', 45, 'Efectivo', v_hoy, '');

  -- --------------------------------------------------------
  -- Transacciones de venta de bono (facturación = venta, no sesión)
  -- --------------------------------------------------------
  insert into transactions (organization_id, client_id, kind, concept, amount, payment_method, date, related_bonus_id)
  values
    (v_org_id, v_c_laura,   'bonus_sale', 'Venta · Bono 10 sesiones i-Model', 380, 'Tarjeta',  v_hoy - 70, v_b_laura),
    (v_org_id, v_c_carmen,  'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Efectivo', v_hoy - 220, v_b_carmen1),
    (v_org_id, v_c_carmen,  'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Efectivo', v_hoy - 12, v_b_carmen2),
    (v_org_id, v_c_nuria,   'bonus_sale', 'Venta · Bono 10 sesiones i-Model', 380, 'Tarjeta',  v_hoy - 22, v_b_nuria),
    (v_org_id, v_c_marisa,  'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Tarjeta',  v_hoy - 240, v_b_marisa),
    (v_org_id, v_c_pilar,   'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Tarjeta',  v_hoy - 60, v_b_pilar),
    (v_org_id, v_c_sofia,   'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Bizum',    v_hoy, v_b_sofia),
    (v_org_id, v_c_gloria,  'bonus_sale', 'Venta · Bono 5 sesiones i-Model',  200, 'Efectivo', v_hoy - 150, v_b_gloria);

  -- --------------------------------------------------------
  -- Agenda: citas repartidas + bloqueos + una reserva online de ejemplo
  -- --------------------------------------------------------
  insert into appointments (organization_id, client_id, date, start_time, duration_min, service_name, note, status, origin, reminder_sent) values
    (v_org_id, v_c_laura,    v_hoy,     '09:30', 60, 'i-Model',          'Última sesión del bono', 'active', 'admin', true),
    (v_org_id, v_c_nuria,    v_hoy,     '11:00', 60, 'Estética general', '', 'active', 'admin', false),
    (v_org_id, v_c_carmen,   v_hoy,     '17:00', 60, 'i-Model',          '', 'active', 'admin', false),
    (v_org_id, v_c_veronica, v_hoy,     '12:00', 60, 'Dietética',        'Primera consulta', 'cancelled', 'admin', false),
    (v_org_id, v_c_teresa,   v_hoy + 1, '10:00', 60, 'i-Model',          '', 'active', 'admin', false),
    (v_org_id, v_c_pilar,    v_hoy + 1, '16:00', 45, 'Maderoterapia',    '', 'active', 'admin', false),
    (v_org_id, v_c_sofia,    v_hoy + 3, '10:00', 60, 'Estética general', 'Estreno de su bono', 'active', 'admin', false);

  insert into appointments (organization_id, client_id, date, start_time, duration_min, service_name, note, status, origin, token) values
    (v_org_id, v_c_rosa, v_hoy + 1, '12:30', 45, 'Maderoterapia', '', 'active', 'online', encode(gen_random_bytes(6), 'hex'));

  insert into blocked_periods (organization_id, date, start_time, end_time, reason) values
    (v_org_id, v_hoy,     '14:00', '16:00', 'Comida'),
    (v_org_id, v_hoy + 1, '14:00', '16:00', 'Comida');

  insert into closed_days (organization_id, date, reason) values
    (v_org_id, v_hoy + 5, 'Formación');

  -- --------------------------------------------------------
  -- Guarda el organization_id para el paso final de SETUP.md
  -- --------------------------------------------------------
  raise notice 'ID de la organización Beatriz Torres: %', v_org_id;
  raise notice 'Guarda este ID: lo necesitas en el paso 4 de SETUP.md para vincular tu usuario.';
end $$;
