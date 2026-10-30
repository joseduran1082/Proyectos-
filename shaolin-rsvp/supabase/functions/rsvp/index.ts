// =====================================================================
//  Edge Function "rsvp"  (Supabase · Deno)
//  - Valida la respuesta del formulario
//  - Guarda / actualiza el registro en la tabla `rsvps`
//  - Si el estado es "attending" Y la persona dejó su email (es opcional): envía la invitación con Resend
//
//  Por qué existe: la API key de Resend NUNCA debe ir en el navegador.
//  Vive aquí, como secreto del servidor.
//
//  Secretos necesarios (ver README):
//    RESEND_API_KEY   -> clave de Resend
//    MAIL_FROM        -> remitente, p. ej. "Shaolin Chuan Tong <rsvp@tudominio.com>"
//  Opcionales (días, horas, precio y avisos se leen de las tablas event_sessions / event_notes):
//    EVENT_NAME, EVENT_LOCATION, EVENT_MAP_URL,
//    MAIL_REPLY_TO, ALLOWED_ORIGIN
//  Supabase inyecta solo: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.

// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// ---------- Configuración del evento (editable por variables de entorno) ----------
const EVENT = {
  name: Deno.env.get("EVENT_NAME") ?? "Shaolin Kung Fu",
  host: "Shaolin Chuan Tong Kung Fu",
  location: Deno.env.get("EVENT_LOCATION") ?? "Badenerstrasse 569, 8048 Zürich",
  mapUrl: Deno.env.get("EVENT_MAP_URL") ?? "https://maps.app.goo.gl/KQB4Q64DLjS6X7df7",
  audience: "All levels welcome",
};

// Respaldo si las tablas event_sessions / event_notes no existen o están vacías.
type EventInfo = { sessions: { day: string; hours: string }[]; price: string[]; reminders: string[] };
const FALLBACK_INFO: EventInfo = {
  sessions: [
    { day: "Thursday 5 November", hours: "12:00 – 13:00" },
    { day: "Saturday 7 November", hours: "17:00 – 18:00" },
  ],
  price: ["Two introductory lessons free", "20 Fr for every next lesson"],
  reminders: ["Black long pants and black shirt", "Clean shoes for the room", "Parking is hard", "Class starts on time"],
};

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"; // en producción: "https://tu-sitio.vercel.app"

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------- Utilidades ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Escapa HTML para que el nombre/mensaje del usuario nunca inyecte código en el email. */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---------- Plantilla del email (HTML con estilos inline, compatible con Gmail/Outlook) ----------
function confirmationEmail(name: string, info: EventInfo) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;width:110px;color:#8c867a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;vertical-align:top">${label}</td>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;color:#efe8da;font-size:16px">${value}</td>
    </tr>`;

  const days = info.sessions.map((x) => esc(x.day)).join("<br>");
  const hours = info.sessions.map((x) => esc(x.hours)).join("<br>");
  const price = info.price.map((x) => esc(x)).join("<br>");
  const reminders = info.reminders
    .map((x, i) => `<tr><td style="padding:3px 12px 3px 0;color:#c5a059;font-size:14px;vertical-align:top">${i + 1}.</td><td style="padding:3px 0;color:#efe8da;font-size:15px">${esc(x)}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#0e0d0b;padding:24px 12px;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#171510">
    <tr><td style="padding:36px 32px 8px">
      <div style="color:#c5a059;font-size:12px;letter-spacing:.2em;text-transform:uppercase">${esc(EVENT.host)}</div>
      <h1 style="margin:16px 0 4px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.1;color:#efe8da">${esc(EVENT.name)}</h1>
      <p style="margin:18px 0 0;color:#efe8da;font-size:17px;line-height:1.5">Hello ${esc(name)}, your place is confirmed.</p>
    </td></tr>
    <tr><td style="padding:16px 32px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${days ? row("Date", days) : ""}
        ${hours ? row("Time", hours) : ""}
        ${price ? row("Price", price) : ""}
        ${row("Location", `${esc(EVENT.location)}<br><a href="${esc(EVENT.mapUrl)}" style="color:#c5a059">Open in Google Maps</a>`)}
        ${row("For", esc(EVENT.audience))}
      </table>
    </td></tr>
    ${reminders ? `<tr><td style="padding:12px 32px 8px">
      <div style="color:#c5a059;font-size:12px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px">Reminder</div>
      <table role="presentation" cellpadding="0" cellspacing="0">${reminders}</table>
    </td></tr>` : ""}
    <tr><td style="padding:16px 32px 36px">
      <p style="margin:0;color:#b9b3a6;font-size:14px;line-height:1.6">
        If your plans change, reply to this email or answer again on the invitation page.
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Hello ${name}, your place is confirmed.\n\n` +
    `${EVENT.name} — ${EVENT.host}\n` +
    info.sessions.map((x) => `${x.day}, ${x.hours}`).join("\n") + "\n" +
    (info.price.length ? `Price: ${info.price.join(" · ")}\n` : "") +
    `Location: ${EVENT.location}\nMap: ${EVENT.mapUrl}\nFor: ${EVENT.audience}\n` +
    (info.reminders.length ? `\nReminder:\n${info.reminders.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n` : "") +
    `\nIf your plans change, reply to this email or answer again on the invitation page.`;

  return { html, text };
}

/** Lee sesiones, precio y avisos de la base de datos; si falla o está vacío, usa el respaldo. */
async function loadEventInfo(db: ReturnType<typeof createClient>): Promise<EventInfo> {
  try {
    const { data, error } = await db.rpc("get_event_info");
    if (error || !data) throw error ?? new Error("empty");
    const d = data as Partial<EventInfo>;
    return {
      sessions: d.sessions?.length ? d.sessions : FALLBACK_INFO.sessions,
      price: d.price?.length ? d.price : FALLBACK_INFO.price,
      reminders: d.reminders?.length ? d.reminders : FALLBACK_INFO.reminders,
    };
  } catch (e) {
    console.error("get_event_info failed, using fallback:", e);
    return FALLBACK_INFO;
  }
}

/** Envía el email vía Resend. Devuelve true si Resend aceptó el envío. */
async function sendConfirmation(to: string, name: string, info: EventInfo): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!apiKey || !from) {
    console.error("Faltan RESEND_API_KEY o MAIL_FROM: no se envía el email.");
    return false;
  }
  const { html, text } = confirmationEmail(name, info);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: Deno.env.get("MAIL_REPLY_TO") || undefined,
      subject: `You're confirmed · ${EVENT.name}`,
      html,
      text,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

// ---------- Handler principal ----------
// Cualquier excepción inesperada se captura: así la respuesta siempre lleva cabeceras CORS
// (si no, el navegador solo vería "CORS error") y el motivo real queda en Logs.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("Unhandled error in rsvp:", err);
    return json({ ok: false, error: "Server error. Please try again in a moment." }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Honeypot: un campo oculto que los humanos no rellenan. Si viene con texto, es un bot.
  // Respondemos "ok" para no darle pistas, pero no guardamos nada.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true });

  // ----- Validación en servidor (nunca confíes solo en la validación del navegador) -----
  const fullName = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
  const email = String(body.email ?? "").trim().toLowerCase();
  const status = String(body.status ?? "");
  const message = String(body.message ?? "").trim();

  if (fullName.length < 2 || fullName.length > 80) return json({ ok: false, error: "Enter your full name (2–80 characters)." }, 422);
  // El email es OPCIONAL: vacío = no recibirá invitación por correo.
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) return json({ ok: false, error: "Enter a valid email address, or leave it empty." }, 422);
  if (status !== "attending" && status !== "not_attending") return json({ ok: false, error: "Choose whether you will attend." }, 422);
  if (message.length > 500) return json({ ok: false, error: "Your note is too long (500 characters max)." }, 422);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ----- Guardar o actualizar -----
  // Con email: una fila por correo (upsert). Sin email: se identifica por nombre (sin distinguir mayúsculas)
  // entre las respuestas que tampoco tienen correo, para que quien responda dos veces no salga duplicado.
  let confirmationAlreadySent = false;

  if (email) {
    const { data: existing, error: readErr } = await db
      .from("rsvps")
      .select("status, confirmation_sent_at")
      .eq("email", email)
      .maybeSingle();
    if (readErr) {
      console.error(readErr);
      return json({ ok: false, error: "Could not save your reply. Try again in a moment." }, 500);
    }
    confirmationAlreadySent = !!existing?.confirmation_sent_at;

    const { error: saveErr } = await db.from("rsvps").upsert(
      { email, full_name: fullName, status, message: message || null },
      { onConflict: "email" },
    );
    if (saveErr) {
      console.error(saveErr);
      return json({ ok: false, error: "Could not save your reply. Try again in a moment." }, 500);
    }
  } else {
    const likeName = fullName.replace(/[\\%_]/g, "\\$&"); // escapar comodines de ilike
    const { data: prev, error: readErr } = await db
      .from("rsvps")
      .select("id")
      .is("email", null)
      .ilike("full_name", likeName)
      .limit(1)
      .maybeSingle();
    if (readErr) {
      console.error(readErr);
      return json({ ok: false, error: "Could not save your reply. Try again in a moment." }, 500);
    }
    const { error: saveErr } = prev
      ? await db.from("rsvps").update({ full_name: fullName, status, message: message || null }).eq("id", prev.id)
      : await db.from("rsvps").insert({ email: null, full_name: fullName, status, message: message || null });
    if (saveErr) {
      console.error(saveErr);
      return json({ ok: false, error: "Could not save your reply. Try again in a moment." }, 500);
    }
  }

  // ----- Email de invitación (solo si asistirá, dejó email y aún no se le envió uno) -----
  let emailSent = false;
  let emailAttempted = false;
  if (email && status === "attending" && !confirmationAlreadySent) {
    emailAttempted = true;
    emailSent = await sendConfirmation(email, fullName, await loadEventInfo(db));
    if (emailSent) {
      await db.from("rsvps").update({ confirmation_sent_at: new Date().toISOString() }).eq("email", email);
    }
  }

  return json({ ok: true, status, emailAttempted, emailSent });
}
