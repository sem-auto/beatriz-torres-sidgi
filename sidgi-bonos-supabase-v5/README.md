# SIDGI Bonos — Beatriz Torres (backend real en Supabase)

Bonos prepagados, agenda y reservas online para Beatriz Torres (Turís,
Valencia). En esta fase, el backend pasa de una demo local en localStorage a
Supabase (Postgres real): los datos son compartidos entre dispositivos.

## Puesta en marcha

Sigue **SETUP.md** paso a paso (crear proyecto, ejecutar las migraciones SQL,
cargar los datos de ejemplo, crear el usuario de acceso y rellenar `env.js`).
Sin ese paso previo, la app no tiene con qué conectarse.

```
npx serve
```

- `index.html` — acceso del negocio (Supabase Auth real: entrar, salir,
  recuperar contraseña). Sin registro público.
- `app.html` — panel: Inicio · Agenda · Clientes · Facturación · Ajustes.
- `reservar.html` — página pública de reservas, sin login.
- `reserva.html?id=TOKEN` — enlace de gestión de una reserva (consultar/cancelar).

## Qué cambia en esta fase

- **Supabase sustituye a localStorage** como fuente de los datos del negocio.
  localStorage solo lo usa, internamente, la sesión de Supabase Auth — nunca
  para clientes, bonos, citas o facturación.
- **Multiempresa desde el modelo**: todas las tablas llevan `organization_id`
  y Row Level Security impide que una empresa vea los datos de otra. Hoy solo
  existe Beatriz Torres, pero el esquema ya está listo para más.
- **Reservas públicas realmente atómicas**: la disponibilidad y el alta de la
  cita se resuelven en una función de base de datos (no en una consulta desde
  el navegador seguida de un insert), y una restricción de la propia tabla de
  citas impide dos reservas en el mismo hueco aunque lleguen a la vez.
- **Login real** con Supabase Auth, incluida recuperación de contraseña.

## Qué NO se toca en esta fase (a propósito)

Portal privado de clientas, dietas y fotografías compartidas, envío
automático real de recordatorios por WhatsApp (el botón manual sí funciona),
pagos online. Ver el motivo en SETUP.md.

## Reglas de negocio (sin cambios)

- Facturación neta = ventas de bonos + servicios sueltos − devoluciones, en
  la fecha del cobro. Las sesiones nunca facturan.
- Estados del bono: activo · agotado (automático) · caducado (automático,
  permite descontar con confirmación) · cancelado (manual).
- Eliminar una sesión devuelve esa sesión al bono. Un bono sin sesiones puede
  eliminarse junto a su cobro.
- Reservar una cita nunca descuenta una sesión de bono.

## Archivos

- `index.html` — login (Supabase Auth)
- `app.html` — panel del negocio
- `reservar.html` / `reserva.html` — páginas públicas de reserva
- `config.js` — capa de datos del panel (async, Supabase + caché en memoria)
- `public-client.js` — capa de datos de las páginas públicas (llama a las RPC)
- `helpers.js` — funciones puras compartidas (fechas, formato, horas)
- `env.js` — configuración de conexión (rellenar según SETUP.md)
- `style.css` — sistema de diseño
- `supabase/migrations/0001_init.sql` — tablas, índices, restricción anti-solapes
- `supabase/migrations/0002_rls.sql` — políticas de aislamiento por empresa
- `supabase/migrations/0003_functions.sql` — funciones RPC (disponibilidad y reserva atómica)
- `supabase/seed.sql` — datos ficticios de demostración
- `manifest.json`, `sw.js`, `icon512.png` — PWA
