/* ============================================================
   SIDGI Bonos — public-client.js
   Usado solo por reservar.html y reserva.html. Sin sesión, sin
   acceso directo a tablas: todo pasa por las funciones RPC
   (SECURITY DEFINER) definidas en supabase/migrations/0003_functions.sql,
   que son las únicas que el rol "anon" puede ejecutar.
   ============================================================ */

const sbPublic = window.supabase.createClient(window.SIDGI_ENV.SUPABASE_URL, window.SIDGI_ENV.SUPABASE_ANON_KEY);
const ORG_ID_PUBLICO = window.SIDGI_ENV.ORGANIZATION_ID;

async function obtenerNegocioPublico() {
  const { data, error } = await sbPublic.rpc('get_public_business', { p_org_id: ORG_ID_PUBLICO });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  if (!r) throw new Error('No se encontró el negocio.');
  return { nombre: r.business_name, telefono: r.phone || '', direccion: r.address || '' };
}

async function obtenerServiciosPublico() {
  const { data, error } = await sbPublic.rpc('get_public_services', { p_org_id: ORG_ID_PUBLICO });
  if (error) throw new Error(error.message);
  return (data || []).map(s => ({ id: s.id, nombre: s.name, duracion_min: s.duration_min, precio: s.price == null ? null : Number(s.price) }));
}

async function obtenerHorasDisponibles(servicioId, fechaISO) {
  const { data, error } = await sbPublic.rpc('get_available_slots', { p_org_id: ORG_ID_PUBLICO, p_service_id: servicioId, p_date: fechaISO });
  if (error) throw new Error(error.message);
  return (data || []).map(r => r.slot.slice(0, 5)).sort();
}

/* Reserva atómica: toda la validación (horario, bloqueos, días cerrados,
   solapes) y el INSERT ocurren en el servidor, en una única función. */
async function reservarCitaPublica({ servicioId, fecha, hora, nombre, telefono, nota }) {
  const { data, error } = await sbPublic.rpc('book_appointment_public', {
    p_org_id: ORG_ID_PUBLICO, p_service_id: servicioId, p_date: fecha, p_time: hora + ':00',
    p_client_name: nombre, p_client_phone: telefono, p_note: nota || ''
  });
  if (error) return { error: error.message };
  const r = data?.[0];
  return {
    cita: {
      id: r.appointment_id, token: r.token, cliente_id: r.client_id,
      servicio: r.service_name, duracion_min: r.duration_min, fecha: r.date, hora: r.start_time.slice(0, 5)
    }
  };
}

async function obtenerCitaPorToken(token) {
  const { data, error } = await sbPublic.rpc('get_appointment_by_token', { p_token: token });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  if (!r) return null;
  return {
    id: r.appointment_id, estado: r.status === 'active' ? 'activa' : 'cancelada',
    fecha: r.date, hora: r.start_time.slice(0, 5), duracion_min: r.duration_min,
    servicio: r.service_name, negocio: { nombre: r.organization_name, telefono: r.organization_phone || '', direccion: r.organization_address || '' }
  };
}

async function cancelarCitaPorToken(token) {
  const { data, error } = await sbPublic.rpc('cancel_appointment_by_token', { p_token: token });
  if (error) throw new Error(error.message);
  return !!data;
}
