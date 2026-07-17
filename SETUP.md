# SIDGI Bonos — Puesta en marcha con Supabase

Esta versión ya no usa localStorage para datos del negocio: todo vive en un
proyecto de Supabase (Postgres real), compartido entre dispositivos.

## 1. Crear el proyecto

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo (elige
   una región cercana, p. ej. Frankfurt para España).
2. Anota la contraseña de la base de datos que te pida — no hace falta usarla
   en la app, pero consérvala.

## 2. Ejecutar las migraciones SQL

En el panel de Supabase: **SQL Editor → New query**. Pega y ejecuta, **en este
orden exacto**, el contenido de cada archivo (uno por uno, esperando a que
termine cada uno antes del siguiente):

1. `supabase/migrations/0001_init.sql` — tablas, índices y la restricción que
   impide solapes de citas a nivel de base de datos.
2. `supabase/migrations/0002_rls.sql` — activa Row Level Security: cada
   empresa solo ve y modifica sus propios datos.
3. `supabase/migrations/0003_functions.sql` — funciones que usa la página
   pública de reservas (disponibilidad y reserva atómica).

Si usas la CLI de Supabase en vez del panel: copia los tres archivos a tu
carpeta `supabase/migrations/` y ejecuta `supabase db push`.

## 3. Cargar los datos de ejemplo

Ejecuta `supabase/seed.sql` en el SQL Editor. Son datos **ficticios** de
demostración (clientas y bonos inventados) con la identidad real del negocio
de Beatriz Torres.

Al terminar, el propio script imprime un aviso (`RAISE NOTICE`) con el **UUID
de la organización**, algo así como:

```
NOTICE: ID de la organización Beatriz Torres: 3414da87-aae2-4e11-8085-fc841f7c2713
```

Guarda ese UUID — lo necesitas en el paso 5.

## 4. Crear el usuario de acceso (Beatriz)

Supabase Auth gestiona los usuarios aparte de las tablas normales, así que no
se crea por SQL directo:

1. Panel de Supabase → **Authentication → Users → Add user**.
2. Introduce el email y una contraseña para Beatriz. Marca **Auto Confirm User**
   (si no, tendría que confirmar el email antes de poder entrar).
3. Copia el **UUID** de ese usuario recién creado (columna `UID` en la tabla de usuarios).
4. Vuelve al **SQL Editor** y ejecuta (sustituyendo los dos UUID):

```sql
insert into organization_users (organization_id, user_id, role)
values ('UUID-DE-LA-ORGANIZACION-DEL-PASO-3', 'UUID-DEL-USUARIO-DEL-PASO-4', 'owner');
```

Con esto, ese usuario ya puede iniciar sesión y ve los datos de esa empresa.

No hay registro público de administradores: solo se crean usuarios así, desde
el panel, a propósito.

## 5. Configurar el frontend

Abre `env.js` y rellena los tres valores:

```js
window.SIDGI_ENV = {
  SUPABASE_URL: 'https://tu-proyecto.supabase.co',      // Ajustes → API → Project URL
  SUPABASE_ANON_KEY: 'eyJ...',                            // Ajustes → API → anon public key
  ORGANIZATION_ID: '3414da87-aae2-4e11-8085-fc841f7c2713' // el UUID del paso 3
};
```

**Nunca pongas aquí la `service_role key`** — esa clave tiene acceso total y
saltándose RLS; solo debe usarse en un servidor, nunca en el navegador. Esta
app solo necesita la clave **anon/public**, que está diseñada para exponerse
en el cliente (RLS es quien la protege).

## 6. Ejecutar

```
npx serve
```

- Panel del negocio: `index.html` → inicia sesión con el email/contraseña del paso 4.
- Página pública de reservas: `reservar.html` (el enlace que se comparte con las clientas).

## 7. Recuperación de contraseña

El enlace "¿Olvidaste tu contraseña?" usa el envío de email integrado de
Supabase Auth. Funciona de fábrica para pruebas, con un límite de envíos por
hora; para producción con volumen real, configura un proveedor SMTP propio en
**Authentication → Email Templates / SMTP Settings**.

## Qué se ha migrado en esta fase

Clientes, agenda (citas, bloqueos, días cerrados, horario), reservas públicas,
tipos de bono, bonos vendidos, sesiones consumidas, servicios sueltos,
devoluciones y facturación: todo vive en Supabase y es el mismo para
cualquier dispositivo que inicie sesión.

## Qué queda para la siguiente fase (a propósito, fuera de esta entrega)

Portal privado de clientas, dietas y fotografías compartidas, envío
automático real de recordatorios (requiere WhatsApp Business API), pagos
online. El botón manual de "Enviar recordatorio" por WhatsApp sí funciona
igual que antes.

## Multiempresa

El esquema ya admite varias organizaciones (tabla `organizations` +
`organization_users` con roles `owner`/`staff`), pero esta demo despliega
**una organización por instalación**: `env.js` fija un `ORGANIZATION_ID`
único, y la página pública de reservas no lo recibe por URL. Para ofrecer
esto como SaaS multiempresa real, el siguiente paso sería que `reservar.html`
tomara el id de organización de la URL (`?org=...`) en vez de `env.js`, y que
el panel permitiera pertenecer a varias empresas a la vez.
