/* ============================================================
   SIDGI Bonos — helpers.js
   Funciones puras (fechas, formato, texto). Sin acceso a datos.
   Compartido por el panel (app.html) y las páginas públicas
   (reservar.html, reserva.html).
   ============================================================ */

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function diasAtrasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function addDiasISO(fechaISO, n) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function sumarMesesISO(fechaISO, meses) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setMonth(d.getMonth() + meses);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function formatFecha(fechaISO) {
  if (!fechaISO) return '—';
  return new Date(fechaISO + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFechaCorta(fechaISO) {
  if (!fechaISO) return '—';
  const d = new Date(fechaISO + 'T12:00:00');
  const hoy = hoyISO();
  if (fechaISO === hoy) return 'Hoy';
  if (fechaISO === diasAtrasISO(1)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatEuros(n) {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function aMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function aHHMM(min) {
  min = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}
function diaSemana(fechaISO) {
  return new Date(fechaISO + 'T12:00:00').getDay();
}
function nombreDiaSemana(n) {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][n];
}

function normalizarTelefono(tel) {
  const digitos = String(tel || '').replace(/\D/g, '');
  return digitos.slice(-9);
}

/* Archivo .ics para "Añadir al calendario" (idéntico en panel y página pública) */
function icsDeCita(cita, nombreNegocio) {
  const ini = cita.fecha.replace(/-/g, '') + 'T' + cita.hora.replace(':', '') + '00';
  const finMin = aMinutos(cita.hora) + cita.duracion_min;
  const fin = cita.fecha.replace(/-/g, '') + 'T' + aHHMM(finMin).replace(':', '') + '00';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SIDGI Bonos//ES', 'BEGIN:VEVENT',
    'UID:' + (cita.id || uuid()) + '@sidgibonos',
    'DTSTART:' + ini, 'DTEND:' + fin,
    'SUMMARY:' + (cita.servicio || 'Cita') + ' — ' + nombreNegocio,
    'DESCRIPTION:Cita en ' + nombreNegocio,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}
