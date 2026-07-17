/* ============================================================
   SIDGI Bonos — config.js (panel del propietario)
   Capa de datos respaldada por Supabase. localStorage NO se usa
   aquí para nada de negocio (solo lo usa, dentro de supabase-js,
   la propia sesión de Supabase Auth).

   Patrón: las MUTACIONES son async y escriben en Supabase; tras
   confirmar éxito, actualizan una caché en memoria (CACHE). Las
   LECTURAS/CÁLCULOS (getClientes, estadoBono, movimientosEnRango...)
   siguen siendo síncronas y leen de esa caché, para no tener que
   convertir todo el pipeline de render a async. cargarTodo() puebla
   la caché al iniciar sesión y cada vez que se recarga la página.
   ============================================================ */

window.sb = window.supabase.createClient(
  window.SIDGI_ENV.SUPABASE_URL,
  window.SIDGI_ENV.SUPABASE_ANON_KEY
);

const sb = window.sb;
const ORG_ID = window.SIDGI_ENV.ORGANIZATION_ID;

let CACHE = {
  clientes: [], tiposBono: [], bonos: [], sesiones: [], servicios: [], devoluciones: [],
  citas: [], bloqueos: [], serviciosReservables: [],
  ajustes: null
};

/* ---------- Sesión (Supabase Auth real) ---------- */

async function getUserSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message };
  return { session: data.session };
}

async function pedirRecuperarPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname.replace(/app\.html.*$/, '') + 'index.html' });
  return error ? { error: error.message } : { ok: true };
}

async function actualizarPassword(nuevaPassword) {
  const { error } = await sb.auth.updateUser({ password: nuevaPassword });
  return error ? { error: error.message } : { ok: true };
}

async function logout() {
  await sb.auth.signOut();
}

/* ---------- Carga inicial: puebla la caché desde Supabase ---------- */

function throwIfError(label, error) {
  if (error) throw new Error(label + ': ' + error.message);
}

async function cargarTodo() {
  const [clientesR, tiposR, bonosR, sesionesR, txR, citasR, bloqueadosR, cerradosR, serviciosResR, ajustesR] = await Promise.all([
    sb.from('clients').select('*').eq('organization_id', ORG_ID).order('created_at', { ascending: false }),
    sb.from('bonus_types').select('*').eq('organization_id', ORG_ID),
    sb.from('client_bonuses').select('*').eq('organization_id', ORG_ID),
    sb.from('bonus_sessions').select('*').eq('organization_id', ORG_ID),
    sb.from('transactions').select('*').eq('organization_id', ORG_ID),
    sb.from('appointments').select('*').eq('organization_id', ORG_ID),
    sb.from('blocked_periods').select('*').eq('organization_id', ORG_ID),
    sb.from('closed_days').select('*').eq('organization_id', ORG_ID),
    sb.from('services').select('*').eq('organization_id', ORG_ID),
    sb.from('business_settings').select('*').eq('organization_id', ORG_ID).maybeSingle()
  ]);

  throwIfError('clientes', clientesR.error); throwIfError('tipos de bono', tiposR.error);
  throwIfError('bonos', bonosR.error); throwIfError('sesiones', sesionesR.error);
  throwIfError('facturación', txR.error); throwIfError('citas', citasR.error);
  throwIfError('bloqueos', bloqueadosR.error); throwIfError('días cerrados', cerradosR.error);
  throwIfError('servicios', serviciosResR.error); throwIfError('ajustes', ajustesR.error);

  CACHE.clientes = clientesR.data.map(mapCliente);
  CACHE.tiposBono = tiposR.data.map(mapTipo);
  CACHE.bonos = bonosR.data.map(mapBono);
  CACHE.sesiones = sesionesR.data.map(mapSesion);
  CACHE.servicios = txR.data.filter(t => t.kind === 'service').map(mapServicio);
  CACHE.devoluciones = txR.data.filter(t => t.kind === 'refund').map(mapDevolucion);
  CACHE.citas = citasR.data.map(mapCita);
  CACHE.bloqueos = [
    ...bloqueadosR.data.map(b => mapBloqueo(b, false)),
    ...cerradosR.data.map(b => mapBloqueo(b, true))
  ];
  CACHE.serviciosReservables = serviciosResR.data.map(mapServicioReservable);
  CACHE.ajustes = ajustesR.data ? mapAjustes(ajustesR.data) : null;
}

/* ---------- Mapeos: fila de Supabase (inglés) -> objeto de caché (español, igual que antes) ---------- */

function mapCliente(r) { return { id: r.id, nombre: r.name, telefono: r.phone || '', notas: r.notes || '', created_at: r.created_at.slice(0, 10) }; }
function mapTipo(r) { return { id: r.id, nombre: r.name, sesiones: r.sessions, precio: Number(r.price), caducidadMeses: r.expiry_months, archivado: r.archived }; }
function mapBono(r) {
  return {
    id: r.id, cliente_id: r.client_id, nombre: r.name, sesiones_totales: r.sessions_total,
    precio: Number(r.price), fecha_compra: r.purchase_date, fecha_caducidad: r.expiry_date,
    forma_pago: r.payment_method, cancelado: r.canceled, bonus_type_id: r.bonus_type_id
  };
}
function mapSesion(r) { return { id: r.id, bono_id: r.bonus_id, cliente_id: r.client_id, fecha: r.session_date, nota: r.note || '' }; }
function mapServicio(r) { return { id: r.id, cliente_id: r.client_id, concepto: r.concept, precio: Number(r.amount), forma_pago: r.payment_method, fecha: r.date, nota: r.note || '' }; }
function mapDevolucion(r) { return { id: r.id, bono_id: r.related_bonus_id, cliente_id: r.client_id, importe: Number(r.amount), fecha: r.date, nota: r.note || '' }; }
function mapCita(r) {
  return {
    id: r.id, cliente_id: r.client_id, fecha: r.date, hora: r.start_time.slice(0, 5),
    duracion_min: r.duration_min, servicio: r.service_name || '', nota: r.note || '',
    estado: r.status === 'active' ? 'activa' : 'cancelada', origen: r.origin,
    recordatorio_enviado: r.reminder_sent, token: r.token
  };
}
function mapBloqueo(r, diaCompleto) {
  return diaCompleto
    ? { id: r.id, fecha: r.date, dia_completo: true, hora_inicio: '00:00', hora_fin: '23:59', motivo: r.reason || '', _tabla: 'closed_days' }
    : { id: r.id, fecha: r.date, dia_completo: false, hora_inicio: r.start_time.slice(0, 5), hora_fin: r.end_time.slice(0, 5), motivo: r.reason || '', _tabla: 'blocked_periods' };
}
function mapServicioReservable(r) { return { id: r.id, nombre: r.name, duracion_min: r.duration_min, precio: r.price == null ? null : Number(r.price), activo: r.active }; }
function mapAjustes(r) {
  const horario = {};
  Object.keys(r.weekly_hours || {}).forEach(k => {
    const h = r.weekly_hours[k];
    horario[k] = { abierto: h.open, desde: h.from, hasta: h.to };
  });
  return {
    negocio: { nombre: r.business_name, telefono: r.phone || '', direccion: r.address || '' },
    duracionDefecto: r.default_appointment_duration,
    msgWhatsapp: r.whatsapp_message,
    recordatorioAuto: r.reminder_auto_prepare,
    horario
  };
}

/* ---------- Lecturas / cálculos (síncronos, desde CACHE — mismo comportamiento que antes) ---------- */

function getClientes() { return CACHE.clientes; }
function getCliente(id) { return CACHE.clientes.find(c => c.id === id) || null; }
function getTipos(incluirArchivados = false) { return incluirArchivados ? CACHE.tiposBono : CACHE.tiposBono.filter(x => !x.archivado); }
function getTipo(id) { return CACHE.tiposBono.find(t => t.id === id) || null; }
function getBonos() { return CACHE.bonos; }
function getBono(id) { return CACHE.bonos.find(b => b.id === id) || null; }
function getBonosDeCliente(clienteId) {
  return CACHE.bonos.filter(b => b.cliente_id === clienteId).sort((a, b) => a.fecha_compra < b.fecha_compra ? -1 : 1);
}
function getSesionesDeBono(bonoId) { return CACHE.sesiones.filter(s => s.bono_id === bonoId); }
function contarSesiones(bonoId) { return getSesionesDeBono(bonoId).length; }
function sesionesRestantes(bono) { return Math.max(0, bono.sesiones_totales - contarSesiones(bono.id)); }

function estadoBono(bono) {
  if (bono.cancelado) return 'cancelado';
  if (contarSesiones(bono.id) >= bono.sesiones_totales) return 'agotado';
  if (bono.fecha_caducidad && bono.fecha_caducidad < hoyISO()) return 'caducado';
  return 'activo';
}
function bonosUsables(clienteId) {
  return getBonosDeCliente(clienteId).filter(b => { const e = estadoBono(b); return e === 'activo' || e === 'caducado'; });
}
function textoEstadoCliente(clienteId) {
  const usables = bonosUsables(clienteId);
  if (!usables.length) return { texto: 'Sin bono activo', clase: 'muted' };
  const b = usables[0];
  const rest = sesionesRestantes(b);
  const extra = usables.length > 1 ? ` · y ${usables.length - 1} más` : '';
  if (estadoBono(b) === 'caducado') return { texto: `Bono caducado · quedan ${rest}${extra}`, clase: 'warn' };
  if (rest <= 2) return { texto: `${rest === 1 ? 'Queda 1 sesión' : 'Quedan 2 sesiones'} · ${b.nombre}${extra}`, clase: 'warn' };
  return { texto: `Quedan ${rest} de ${b.sesiones_totales} · ${b.nombre}${extra}`, clase: '' };
}
function ultimaActividad(clienteId) {
  let max = getCliente(clienteId)?.created_at || '';
  CACHE.sesiones.forEach(s => { if (s.cliente_id === clienteId && s.fecha > max) max = s.fecha; });
  CACHE.bonos.forEach(b => { if (b.cliente_id === clienteId && b.fecha_compra > max) max = b.fecha_compra; });
  CACHE.servicios.forEach(s => { if (s.cliente_id === clienteId && s.fecha > max) max = s.fecha; });
  CACHE.devoluciones.forEach(d => { if (d.cliente_id === clienteId && d.fecha > max) max = d.fecha; });
  return max;
}

/* ---------- Mutaciones: clientes ---------- */

async function crearCliente({ nombre, telefono, notas }) {
  const { data, error } = await sb.from('clients').insert({
    organization_id: ORG_ID, name: nombre.trim(), phone: (telefono || '').trim(), notes: (notas || '').trim()
  }).select().single();
  if (error) throw new Error(error.message);
  const c = mapCliente(data);
  CACHE.clientes.unshift(c);
  return c;
}

async function editarCliente(id, campos) {
  const patch = {};
  if ('nombre' in campos) patch.name = campos.nombre;
  if ('telefono' in campos) patch.phone = campos.telefono;
  if ('notas' in campos) patch.notes = campos.notas;
  const { data, error } = await sb.from('clients').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const c = mapCliente(data);
  const i = CACHE.clientes.findIndex(x => x.id === id);
  if (i >= 0) CACHE.clientes[i] = c;
  return c;
}

async function eliminarClienteCompleto(id) {
  const { error } = await sb.from('clients').delete().eq('id', id); // ON DELETE CASCADE arrastra bonos/sesiones/citas/facturación
  if (error) throw new Error(error.message);
  CACHE.clientes = CACHE.clientes.filter(c => c.id !== id);
  CACHE.bonos = CACHE.bonos.filter(b => b.cliente_id !== id);
  CACHE.sesiones = CACHE.sesiones.filter(s => s.cliente_id !== id);
  CACHE.servicios = CACHE.servicios.filter(s => s.cliente_id !== id);
  CACHE.devoluciones = CACHE.devoluciones.filter(d => d.cliente_id !== id);
  CACHE.citas = CACHE.citas.filter(c => c.cliente_id !== id);
}

/* ---------- Mutaciones: tipos de bono ---------- */

async function crearTipo({ nombre, sesiones, precio, caducidadMeses }) {
  const { data, error } = await sb.from('bonus_types').insert({
    organization_id: ORG_ID, name: nombre.trim(), sessions: Number(sesiones), price: Number(precio),
    expiry_months: caducidadMeses ? Number(caducidadMeses) : null
  }).select().single();
  if (error) throw new Error(error.message);
  const t = mapTipo(data);
  CACHE.tiposBono.push(t);
  return t;
}

async function editarTipo(id, campos) {
  const patch = {};
  if ('nombre' in campos) patch.name = campos.nombre;
  if ('sesiones' in campos) patch.sessions = campos.sesiones;
  if ('precio' in campos) patch.price = campos.precio;
  if ('caducidadMeses' in campos) patch.expiry_months = campos.caducidadMeses;
  if ('archivado' in campos) patch.archived = campos.archivado;
  const { data, error } = await sb.from('bonus_types').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const t = mapTipo(data);
  const i = CACHE.tiposBono.findIndex(x => x.id === id);
  if (i >= 0) CACHE.tiposBono[i] = t;
  return t;
}

/* ---------- Mutaciones: bonos vendidos (venta = factura; sesión = nunca factura) ---------- */

async function venderBono({ clienteId, tipoId, formaPago, fechaCompra }) {
  const tipo = getTipo(tipoId);
  if (!tipo) throw new Error('Tipo de bono no encontrado');
  const fecha = fechaCompra || hoyISO();
  const caducidad = tipo.caducidadMeses ? sumarMesesISO(fecha, tipo.caducidadMeses) : null;

  const { data: bonoData, error: e1 } = await sb.from('client_bonuses').insert({
    organization_id: ORG_ID, client_id: clienteId, bonus_type_id: tipoId,
    name: tipo.nombre, sessions_total: tipo.sesiones, price: tipo.precio,
    purchase_date: fecha, expiry_date: caducidad, payment_method: formaPago
  }).select().single();
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await sb.from('transactions').insert({
    organization_id: ORG_ID, client_id: clienteId, kind: 'bonus_sale',
    concept: 'Venta · ' + tipo.nombre, amount: tipo.precio, payment_method: formaPago,
    date: fecha, related_bonus_id: bonoData.id
  });
  if (e2) throw new Error(e2.message);

  const b = mapBono(bonoData);
  CACHE.bonos.push(b);
  return b;
}

async function editarBono(id, campos) {
  const patch = {};
  if ('fecha_caducidad' in campos) patch.expiry_date = campos.fecha_caducidad;
  if ('fecha_compra' in campos) patch.purchase_date = campos.fecha_compra;
  if ('forma_pago' in campos) patch.payment_method = campos.forma_pago;
  const { data, error } = await sb.from('client_bonuses').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const b = mapBono(data);
  const i = CACHE.bonos.findIndex(x => x.id === id);
  if (i >= 0) CACHE.bonos[i] = b;

  // Mantener sincronizada la venta en el libro de facturación (transactions)
  if ('fecha_compra' in campos || 'forma_pago' in campos) {
    const patchTx = {};
    if ('fecha_compra' in campos) patchTx.date = campos.fecha_compra;
    if ('forma_pago' in campos) patchTx.payment_method = campos.forma_pago;
    await sb.from('transactions').update(patchTx).eq('related_bonus_id', id).eq('kind', 'bonus_sale');
  }
  return b;
}

/* Solo si no tiene sesiones: desaparece también su cobro de facturación */
async function eliminarBono(id) {
  if (CACHE.sesiones.some(s => s.bono_id === id)) return false;
  await sb.from('transactions').delete().eq('related_bonus_id', id);
  const { error } = await sb.from('client_bonuses').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.bonos = CACHE.bonos.filter(b => b.id !== id);
  CACHE.devoluciones = CACHE.devoluciones.filter(d => d.bono_id !== id);
  return true;
}

async function cancelarBono(id, importeDevuelto, nota) {
  const { data, error } = await sb.from('client_bonuses').update({ canceled: true }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const b = mapBono(data);
  const i = CACHE.bonos.findIndex(x => x.id === id);
  if (i >= 0) CACHE.bonos[i] = b;

  if (importeDevuelto > 0) {
    const { data: txData, error: e2 } = await sb.from('transactions').insert({
      organization_id: ORG_ID, client_id: b.cliente_id, kind: 'refund',
      concept: 'Devolución · ' + b.nombre, amount: importeDevuelto,
      date: hoyISO(), related_bonus_id: id, note: nota || 'Cancelación de bono'
    }).select().single();
    if (e2) throw new Error(e2.message);
    CACHE.devoluciones.push(mapDevolucion(txData));
  }
}

/* ---------- Mutaciones: sesiones consumidas (nunca facturan) ---------- */

async function registrarSesion({ bonoId, fecha, nota }) {
  const b = getBono(bonoId);
  const { data, error } = await sb.from('bonus_sessions').insert({
    organization_id: ORG_ID, bonus_id: bonoId, client_id: b.cliente_id,
    session_date: fecha || hoyISO(), note: (nota || '').trim()
  }).select().single();
  if (error) throw new Error(error.message);
  const s = mapSesion(data);
  CACHE.sesiones.push(s);
  return s;
}

async function editarSesion(id, campos) {
  const patch = {};
  if ('fecha' in campos) patch.session_date = campos.fecha;
  if ('nota' in campos) patch.note = campos.nota;
  const { data, error } = await sb.from('bonus_sessions').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const s = mapSesion(data);
  const i = CACHE.sesiones.findIndex(x => x.id === id);
  if (i >= 0) CACHE.sesiones[i] = s;
  return s;
}

/* Eliminar sesión = el bono recupera esa sesión automáticamente (se cuenta, no se guarda contador) */
async function eliminarSesion(id) {
  const { error } = await sb.from('bonus_sessions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.sesiones = CACHE.sesiones.filter(s => s.id !== id);
}

/* ---------- Mutaciones: servicios sueltos (transactions kind='service') ---------- */

async function registrarServicio({ clienteId, concepto, precio, formaPago, fecha, nota }) {
  const { data, error } = await sb.from('transactions').insert({
    organization_id: ORG_ID, client_id: clienteId, kind: 'service',
    concept: concepto.trim(), amount: Number(precio), payment_method: formaPago,
    date: fecha || hoyISO(), note: (nota || '').trim()
  }).select().single();
  if (error) throw new Error(error.message);
  const s = mapServicio(data);
  CACHE.servicios.push(s);
  return s;
}

async function editarServicio(id, campos) {
  const patch = {};
  if ('concepto' in campos) patch.concept = campos.concepto;
  if ('precio' in campos) patch.amount = campos.precio;
  if ('fecha' in campos) patch.date = campos.fecha;
  if ('forma_pago' in campos) patch.payment_method = campos.forma_pago;
  const { data, error } = await sb.from('transactions').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const s = mapServicio(data);
  const i = CACHE.servicios.findIndex(x => x.id === id);
  if (i >= 0) CACHE.servicios[i] = s;
  return s;
}

async function eliminarServicio(id) {
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.servicios = CACHE.servicios.filter(s => s.id !== id);
}

/* ---------- Mutaciones: devoluciones (transactions kind='refund') ---------- */

async function registrarDevolucion({ bonoId, importe, fecha, nota }) {
  const b = getBono(bonoId);
  const { data, error } = await sb.from('transactions').insert({
    organization_id: ORG_ID, client_id: b.cliente_id, kind: 'refund',
    concept: 'Devolución · ' + b.nombre, amount: Number(importe),
    date: fecha || hoyISO(), related_bonus_id: bonoId, note: (nota || '').trim()
  }).select().single();
  if (error) throw new Error(error.message);
  const d = mapDevolucion(data);
  CACHE.devoluciones.push(d);
  return d;
}

async function editarDevolucion(id, campos) {
  const patch = {};
  if ('importe' in campos) patch.amount = campos.importe;
  if ('fecha' in campos) patch.date = campos.fecha;
  if ('nota' in campos) patch.note = campos.nota;
  const { data, error } = await sb.from('transactions').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const d = mapDevolucion(data);
  const i = CACHE.devoluciones.findIndex(x => x.id === id);
  if (i >= 0) CACHE.devoluciones[i] = d;
  return d;
}

async function eliminarDevolucion(id) {
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.devoluciones = CACHE.devoluciones.filter(d => d.id !== id);
}

/* ---------- Facturación (igual que antes: se deriva de bonos + servicios + devoluciones) ---------- */

function movimientosEnRango(desdeISO, hastaISO) {
  const en = f => f >= desdeISO && f <= hastaISO;
  const nombreDe = id => getCliente(id)?.nombre || 'Cliente eliminado';
  const movs = [];
  CACHE.bonos.forEach(b => {
    if (en(b.fecha_compra)) movs.push({ kind: 'bono', id: b.id, fecha: b.fecha_compra, cliente: nombreDe(b.cliente_id), cliente_id: b.cliente_id, concepto: b.nombre, importe: b.precio, forma_pago: b.forma_pago });
  });
  CACHE.servicios.forEach(s => {
    if (en(s.fecha)) movs.push({ kind: 'servicio', id: s.id, fecha: s.fecha, cliente: nombreDe(s.cliente_id), cliente_id: s.cliente_id, concepto: s.concepto, importe: s.precio, forma_pago: s.forma_pago });
  });
  CACHE.devoluciones.forEach(d => {
    if (en(d.fecha)) movs.push({ kind: 'devolucion', id: d.id, fecha: d.fecha, cliente: nombreDe(d.cliente_id), cliente_id: d.cliente_id, concepto: 'Devolución' + (d.nota ? ' · ' + d.nota : ''), importe: -d.importe, forma_pago: '' });
  });
  movs.sort((a, b) => a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
  return movs;
}
function totalEnRango(desdeISO, hastaISO) {
  return movimientosEnRango(desdeISO, hastaISO).reduce((s, m) => s + m.importe, 0);
}
function sesionesEnFecha(fechaISO) {
  const nombreDe = id => getCliente(id)?.nombre || 'Cliente eliminado';
  return CACHE.sesiones.filter(s => s.fecha === fechaISO).map(s => {
    const b = getBono(s.bono_id);
    return { kind: 'sesion', id: s.id, fecha: s.fecha, cliente: nombreDe(s.cliente_id), cliente_id: s.cliente_id, concepto: 'Sesión · ' + (b?.nombre || 'Bono'), importe: 0, nota: s.nota };
  });
}

/* ---------- Ajustes del negocio ---------- */

function getAjustesApp() { return CACHE.ajustes; }

async function setAjustesApp(patch) {
  const dbPatch = {};
  if (patch.negocio) {
    dbPatch.business_name = patch.negocio.nombre;
    dbPatch.phone = patch.negocio.telefono;
    dbPatch.address = patch.negocio.direccion;
  }
  if ('duracionDefecto' in patch) dbPatch.default_appointment_duration = patch.duracionDefecto;
  if ('msgWhatsapp' in patch) dbPatch.whatsapp_message = patch.msgWhatsapp;
  if ('recordatorioAuto' in patch) dbPatch.reminder_auto_prepare = patch.recordatorioAuto;
  if ('horario' in patch) {
    const weekly = {};
    Object.keys(patch.horario).forEach(k => {
      const h = patch.horario[k];
      weekly[k] = { open: h.abierto, from: h.desde, to: h.hasta };
    });
    dbPatch.weekly_hours = weekly;
  }

  const { data, error } = await sb.from('business_settings').update(dbPatch).eq('organization_id', ORG_ID).select().single();
  if (error) throw new Error(error.message);
  CACHE.ajustes = mapAjustes(data);
}

/* ---------- Agenda: consultas síncronas desde caché ---------- */

function getCitas() { return CACHE.citas; }
function getCita(id) { return CACHE.citas.find(c => c.id === id) || null; }
function citasDeFecha(fechaISO) { return CACHE.citas.filter(c => c.fecha === fechaISO).sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora)); }
function citasDeCliente(clienteId) { return CACHE.citas.filter(c => c.cliente_id === clienteId); }
function proximasCitasCliente(clienteId) {
  const hoy = hoyISO();
  return citasDeCliente(clienteId).filter(c => c.estado === 'activa' && c.fecha >= hoy)
    .sort((a, b) => a.fecha === b.fecha ? aMinutos(a.hora) - aMinutos(b.hora) : (a.fecha < b.fecha ? -1 : 1));
}
function horarioDelDia(fechaISO) {
  return getAjustesApp().horario[String(diaSemana(fechaISO))];
}
function bloqueosDeFecha(fechaISO) {
  return CACHE.bloqueos.filter(b => b.fecha === fechaISO).sort((a, b) => aMinutos(a.hora_inicio || '00:00') - aMinutos(b.hora_inicio || '00:00'));
}

function conflictoCita(fechaISO, hora, duracionMin, ignorarCitaId = null) {
  const ini = aMinutos(hora), fin = ini + duracionMin;
  const solapa = (i2, f2) => ini < f2 && i2 < fin;
  for (const c of citasDeFecha(fechaISO)) {
    if (c.id === ignorarCitaId || c.estado !== 'activa') continue;
    const i2 = aMinutos(c.hora), f2 = i2 + c.duracion_min;
    if (solapa(i2, f2)) {
      const nombre = getCliente(c.cliente_id)?.nombre || 'otra cita';
      return { tipo: 'cita', texto: `Esa hora está ocupada: ${nombre}, ${c.hora}–${aHHMM(f2)}.` };
    }
  }
  for (const b of bloqueosDeFecha(fechaISO)) {
    if (b.dia_completo) return { tipo: 'bloqueo', texto: `El día está bloqueado: ${b.motivo || 'día cerrado'}.` };
    const i2 = aMinutos(b.hora_inicio), f2 = aMinutos(b.hora_fin);
    if (solapa(i2, f2)) return { tipo: 'bloqueo', texto: `Esas horas están bloqueadas (${b.motivo || 'bloqueo'}, ${b.hora_inicio}–${b.hora_fin}).` };
  }
  return null;
}
function fueraDeHorario(fechaISO, hora, duracionMin) {
  const h = horarioDelDia(fechaISO);
  if (!h.abierto) return 'Ese día está marcado como cerrado en tu horario.';
  const ini = aMinutos(hora), fin = ini + duracionMin;
  if (ini < aMinutos(h.desde) || fin > aMinutos(h.hasta)) return `Queda fuera de tu horario (${h.desde}–${h.hasta}).`;
  return null;
}

/* ---------- Mutaciones: citas ----------
   El admin inserta directamente en "appointments". La restricción de
   exclusión de la base de datos (ver 0001_init.sql) es quien impide
   de verdad los solapes, incluso si esta comprobación en el navegador
   fallara o hubiera una carrera con una reserva pública simultánea. */

async function crearCita({ clienteId, fecha, hora, duracionMin, servicio, nota }) {
  const { data, error } = await sb.from('appointments').insert({
    organization_id: ORG_ID, client_id: clienteId, date: fecha, start_time: hora,
    duration_min: Number(duracionMin), service_name: (servicio || '').trim(),
    note: (nota || '').trim(), status: 'active', origin: 'admin'
  }).select().single();
  if (error) {
    if (error.code === '23P01') throw new Error('Esa hora se acaba de ocupar. Elige otra, por favor.');
    throw new Error(error.message);
  }
  const c = mapCita(data);
  CACHE.citas.push(c);
  return c;
}

async function editarCita(id, campos) {
  const patch = {};
  if ('cliente_id' in campos) patch.client_id = campos.cliente_id;
  if ('fecha' in campos) patch.date = campos.fecha;
  if ('hora' in campos) patch.start_time = campos.hora;
  if ('duracion_min' in campos) patch.duration_min = campos.duracion_min;
  if ('servicio' in campos) patch.service_name = campos.servicio;
  if ('nota' in campos) patch.note = campos.nota;
  if ('estado' in campos) patch.status = campos.estado === 'activa' ? 'active' : 'cancelled';
  if ('recordatorio_enviado' in campos) patch.reminder_sent = campos.recordatorio_enviado;
  const { data, error } = await sb.from('appointments').update(patch).eq('id', id).select().single();
  if (error) {
    if (error.code === '23P01') throw new Error('Esa hora se acaba de ocupar. Elige otra, por favor.');
    throw new Error(error.message);
  }
  const c = mapCita(data);
  const i = CACHE.citas.findIndex(x => x.id === id);
  if (i >= 0) CACHE.citas[i] = c;
  return c;
}

async function eliminarCita(id) {
  const { error } = await sb.from('appointments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.citas = CACHE.citas.filter(c => c.id !== id);
}

/* ---------- Mutaciones: bloqueos y días cerrados ---------- */

function getBloqueos() { return CACHE.bloqueos; }

async function crearBloqueo({ fecha, diaCompleto, horaInicio, horaFin, motivo }) {
  if (diaCompleto) {
    const { data, error } = await sb.from('closed_days').insert({ organization_id: ORG_ID, date: fecha, reason: (motivo || '').trim() }).select().single();
    if (error) throw new Error(error.message);
    const b = mapBloqueo(data, true);
    CACHE.bloqueos.push(b);
    return b;
  }
  const { data, error } = await sb.from('blocked_periods').insert({
    organization_id: ORG_ID, date: fecha, start_time: horaInicio, end_time: horaFin, reason: (motivo || '').trim()
  }).select().single();
  if (error) throw new Error(error.message);
  const b = mapBloqueo(data, false);
  CACHE.bloqueos.push(b);
  return b;
}

async function eliminarBloqueo(id) {
  const b = CACHE.bloqueos.find(x => x.id === id);
  if (!b) return;
  const { error } = await sb.from(b._tabla).delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.bloqueos = CACHE.bloqueos.filter(x => x.id !== id);
}

/* ---------- Servicios reservables ---------- */

function getServiciosReservables(soloActivos = false) {
  return soloActivos ? CACHE.serviciosReservables.filter(s => s.activo) : CACHE.serviciosReservables;
}
function getServicioReservable(id) { return CACHE.serviciosReservables.find(s => s.id === id) || null; }

async function crearServicioReservable({ nombre, duracionMin, precio, activo }) {
  const { data, error } = await sb.from('services').insert({
    organization_id: ORG_ID, name: nombre.trim(), duration_min: Number(duracionMin),
    price: (precio === '' || precio == null) ? null : Number(precio), active: activo !== false
  }).select().single();
  if (error) throw new Error(error.message);
  const s = mapServicioReservable(data);
  CACHE.serviciosReservables.push(s);
  return s;
}

async function editarServicioReservable(id, campos) {
  const patch = {};
  if ('nombre' in campos) patch.name = campos.nombre;
  if ('duracion_min' in campos) patch.duration_min = campos.duracion_min;
  if ('precio' in campos) patch.price = campos.precio;
  if ('activo' in campos) patch.active = campos.activo;
  const { data, error } = await sb.from('services').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const s = mapServicioReservable(data);
  const i = CACHE.serviciosReservables.findIndex(x => x.id === id);
  if (i >= 0) CACHE.serviciosReservables[i] = s;
  return s;
}

async function eliminarServicioReservable(id) {
  const { error } = await sb.from('services').delete().eq('id', id);
  if (error) throw new Error(error.message);
  CACHE.serviciosReservables = CACHE.serviciosReservables.filter(s => s.id !== id);
}

/* ---------- Recordatorios ---------- */

function mensajeRecordatorio(cita) {
  const aj = getAjustesApp();
  const cliente = getCliente(cita.cliente_id);
  return aj.msgWhatsapp
    .replaceAll('{cliente}', cliente?.nombre.split(' ')[0] || 'cliente')
    .replaceAll('{negocio}', aj.negocio.nombre)
    .replaceAll('{fecha}', formatFecha(cita.fecha))
    .replaceAll('{hora}', cita.hora)
    .replaceAll('{servicio}', cita.servicio || 'tu sesión');
}

/* "Preparar" (no enviar de verdad): marca como listas para enviar las citas
   activas dentro de las próximas 24h. El envío real de WhatsApp queda para
   cuando se conecte WhatsApp Business API — ver README/SETUP. */
async function procesarRecordatoriosAuto() {
  if (!getAjustesApp().recordatorioAuto) return 0;
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + 24 * 3600 * 1000);
  const pendientes = CACHE.citas.filter(c => {
    if (c.estado !== 'activa' || c.recordatorio_enviado) return false;
    const inicio = new Date(c.fecha + 'T' + c.hora + ':00');
    return inicio > ahora && inicio <= limite;
  });
  for (const c of pendientes) {
    await editarCita(c.id, { recordatorio_enviado: true });
  }
  return pendientes.length;
}
