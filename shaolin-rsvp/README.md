# Shaolin Kung Fu · RSVP

Página de confirmación de asistencia (RSVP) — **Opción A: serverless**.
HTML5 + Tailwind CSS + JavaScript vanilla · Supabase (base de datos + Edge Function) · Resend (email).

```
shaolin-rsvp/
├── index.html                  ← la página (hero, botones, listas, modal)
├── assets/
│   ├── css/tailwind.css        ← CSS ya compilado (no necesitas Node para usar la web)
│   ├── img/hero-bg.jpg         ← póster SIN texto (fondo claro con montañas) · móvil
│   ├── img/hero-bg-wide.jpg    ← el mismo fondo extendido a la izquierda · escritorio
│   ├── img/poster.jpg          ← póster original, solo para la vista previa al compartir
│   └── js/
│       ├── config.js           ← ★ ÚNICO archivo del frontend que editas (claves + datos del evento)
│       ├── api.js              ← capa de datos (Supabase real o modo demo)
│       └── app.js              ← modal, validación, listas en vivo
├── supabase/
│   ├── schema.sql              ← ★ tabla + seguridad (pegar en SQL Editor)
│   ├── config.toml
│   └── functions/rsvp/index.ts ← ★ guarda la respuesta y envía el email con Resend
├── src/input.css, tailwind.config.js, package.json   ← solo si quieres cambiar estilos
├── .env.example                ← lista de secretos del servidor
└── netlify.toml
```

**Pruébala ya, sin configurar nada:** abre `index.html` con doble clic. Arranca en *modo demo*
(las respuestas se guardan solo en tu navegador, no se envía email). Cuando pongas tus claves en
`config.js`, pasa sola a modo real.

---

## Cómo funciona (y por qué así)

```
Navegador ──(1) POST /functions/v1/rsvp──▶ Edge Function ──▶ tabla rsvps (Supabase)
                                              └──────────────▶ Resend ──▶ email al invitado
Navegador ──(2) POST /rest/v1/rpc/get_event_info ──▶ días, horas, precio, avisos y lugar
```

* **La clave de Resend nunca llega al navegador.** Por eso el email se envía desde una Edge Function.
  (EmailJS/Resend directos desde el frontend exponen la clave y permiten que cualquiera use tu cuenta para enviar correo.)
* **La tabla de respuestas está cerrada al público** (RLS sin políticas). La web **no muestra** quién viene y quién no:
  solo tú ves las respuestas, en Supabase → Table Editor → `rsvps`. Nombres, correos y notas nunca se exponen.
* **El email es opcional.** Solo quien lo escribe recibe la invitación por correo. Con email: una respuesta por correo
  (si responde de nuevo, se actualiza; puede pasar de "No asistirá" a "Asistirá") y la invitación se envía **una sola vez**.
  Sin email: se identifica por nombre, para que quien cambie de respuesta no salga duplicado.
* **Listas "en vivo":** se refrescan tras cada envío, cada 15 s mientras la pestaña está abierta y al volver a ella.

---

## Paso a paso

### 1. Crear el proyecto en Supabase (gratis)
1. Entra en <https://supabase.com> → **New project**. Guarda la contraseña de la base de datos.
2. Cuando termine de crearse: **SQL Editor → New query**, pega todo `supabase/schema.sql` y pulsa **Run**.
3. Comprueba en **Table Editor** que existe la tabla `rsvps`.
4. **Project Settings → API**: copia **Project URL** y la clave **anon / publishable**.

> **Si ya habías creado la tabla** (antes de que el email fuera opcional): ejecuta en el SQL Editor
> `alter table public.rsvps alter column email drop not null;` (o vuelve a pegar `schema.sql` entero) y
> **vuelve a desplegar la función**: `npx supabase functions deploy rsvp`.

### 2. Cuenta de Resend (emails)
1. Crea cuenta en <https://resend.com> → **API Keys → Create API Key** (permiso *Sending access*). Cópiala.
2. **Remitente:**
   * *Para probar:* `MAIL_FROM="Shaolin Kung Fu <onboarding@resend.dev>"`. Con este remitente de pruebas
     **solo puedes enviar a tu propio correo** (el de tu cuenta Resend).
   * *Para producción:* **Domains → Add Domain**, añade los registros DNS que te indica y usa
     un remitente de tu dominio, p. ej. `Shaolin Chuan Tong <rsvp@tudominio.com>`.
     Sin dominio verificado, los invitados no recibirán el email.

### 3. Variables de entorno y despliegue de la función

Los secretos viven en Supabase, **no en el código ni en Git** (ver `.env.example`).

**Con la CLI de Supabase** (desde la carpeta del proyecto):
```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF        # el ID está en la URL: https://TU_PROJECT_REF.supabase.co

npx supabase secrets set \
  RESEND_API_KEY="re_xxxxxxxxxxxxxxxx" \
  MAIL_FROM="Shaolin Chuan Tong <rsvp@tudominio.com>" \
  MAIL_REPLY_TO="tu-correo@ejemplo.com" \
  EVENT_LOCATION="Badenerstrasse 569, 8048 Zürich"

npx supabase functions deploy rsvp --no-verify-jwt
```

**Sin CLI (desde el panel):** *Edge Functions → Deploy a new function → Via Editor*, nombre `rsvp`,
pega `supabase/functions/rsvp/index.ts`, desactiva **Verify JWT**, y añade los secretos en
*Edge Functions → Secrets*.

> `--no-verify-jwt` es necesario porque la función es pública a propósito (cualquier invitado puede
> responder); se protege validando todo en el servidor, con un campo trampa anti-bots y enviando un solo
> email por correo. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo.

### 4. Conectar el frontend
Edita `assets/js/config.js`:
```js
SUPABASE_URL: "https://TU_PROJECT_REF.supabase.co",
SUPABASE_ANON_KEY: "tu-clave-anon-o-publishable",
```
Fechas, horas, precio y avisos se editan en Supabase → Table Editor → `event_sessions` y `event_notes` (la web y el email se actualizan solos; `EVENT` en `config.js` es solo respaldo). El lugar se cambia en Supabase → `event_settings` → `event_location` (y en el email,
y vuelve a ejecutar `supabase secrets set …`).

### 5. Probar
1. Abre `index.html` (o tu sitio ya desplegado), pulsa **I will attend**, y rellena con *tu* correo.
2. Debe aparecer tu nombre en **Attending** y llegar el email (mira spam).
3. Revisa la fila en **Table Editor → rsvps** (estado `attending`, `confirmation_sent_at` relleno).
4. Repite con **I will not attend** y otro correo → aparece en **Not attending**, sin email.

---

## Desplegar gratis

La web es estática y el CSS ya está compilado: **no hay paso de build**.

### Netlify (lo más rápido)
* **Arrastrar y soltar:** <https://app.netlify.com/drop> → arrastra la carpeta del proyecto (sin `node_modules`). Listo.
* **Desde GitHub:** *Add new site → Import an existing project* → elige el repo →
  *Build command:* vacío · *Publish directory:* `.` → Deploy.

### Vercel
1. Sube el proyecto a un repo de GitHub.
2. <https://vercel.com/new> → importa el repo → **Framework Preset: Other**.
3. *Build Command:* vacío · *Output Directory:* `.` → **Deploy**.
   (Alternativa por terminal: `npx vercel --prod`.)

### Después de desplegar
1. **Restringe CORS:** `npx supabase secrets set ALLOWED_ORIGIN="https://tu-sitio.vercel.app"` y vuelve a hacer `functions deploy`.
2. En `index.html`, cambia `og:image` por la URL absoluta de `assets/img/poster.jpg`
   (así WhatsApp/iMessage/LinkedIn muestran la vista previa).
3. Dominio propio: *Domains* en Netlify/Vercel.

---

## Personalizar

| Quiero… | Dónde |
|---|---|
| Cambiar días, horas, precio, avisos | Supabase → Table Editor → `event_sessions` / `event_notes` (añade o borra filas; `sort` ordena) |
| Cambiar el lugar | Supabase → Table Editor → `event_settings` → `event_location` (la web y el email lo leen de ahí) |
| Cambiar colores o fuentes | `tailwind.config.js` (`colors`, `fontFamily`) |
| Cambiar estilos | `src/input.css` o clases en `index.html`, luego `npm install && npm run build` |
| Cambiar el texto del email | `confirmationEmail()` en `supabase/functions/rsvp/index.ts` |
| Ver / exportar asistentes con correo | Supabase → Table Editor, o SQL: `select full_name, email, message from rsvps where status='attending'` |

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Se ve el aviso amarillo "Demo mode" | `config.js` aún tiene los valores `YOUR_…`. |
| "Could not reach the server" | URL mal escrita, función sin desplegar, o `ALLOWED_ORIGIN` no coincide con tu dominio. Mira *Edge Functions → Logs*. |
| Se guarda la respuesta pero no llega el email | `RESEND_API_KEY`/`MAIL_FROM` sin definir, remitente sin dominio verificado, o estás enviando a un correo que no es el tuyo con `onboarding@resend.dev`. Los logs de la función lo indican. |
| Los días, horas, precio o avisos no salen | No ejecutaste `schema.sql` completo (falta `get_event_info`) o la clave anon es incorrecta. |
| Quiero reenviar el email a alguien | En SQL: `update rsvps set confirmation_sent_at = null where email = 'x@y.com'` y que vuelva a responder. |

## Seguridad y privacidad

* Los nombres se muestran públicamente (el modal lo avisa); correo y nota quedan privados.
* El nombre del usuario se inserta con `textContent` y se escapa en el email: no puede inyectar HTML.
* Si recibes spam, añade [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) al formulario y verifícalo en la función.
* Nunca subas a Git la `service_role` ni la clave de Resend (`.gitignore` ya excluye `.env`).
