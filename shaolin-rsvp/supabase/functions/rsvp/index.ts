import { createClient } from "npm:@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

// ---------- Configuración del evento ----------
const EVENT = {
  name: Deno.env.get("EVENT_NAME") ?? "Shaolin Kung Fu",
  host: "Shaolin Chuan Tong Kung Fu",
  date: Deno.env.get("EVENT_DATE") ?? "To be announced soon",
  time: Deno.env.get("EVENT_TIME") ?? "To be announced soon",
  location: Deno.env.get("EVENT_LOCATION") ?? "Badenerstrasse 569, 8048 Zürich",
  mapUrl: Deno.env.get("EVENT_MAP_URL") ?? "https://maps.app.goo.gl/KQB4Q64DLjS6X7df7",
  audience: "All levels welcome",
};

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

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

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---------- Plantilla del email para el invitado ----------
function confirmationEmail(name: string) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;width:110px;color:#8c867a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;vertical-align:top">${label}</td>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;color:#efe8da;font-size:16px">${value}</td>
    </tr>`;

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
        ${row("Date", esc(EVENT.date))}
        ${row("Time", esc(EVENT.time))}
        ${row("Location", `${esc(EVENT.location)}<br><a href="${esc(EVENT.mapUrl)}" style="color:#c5a059">Open in Google Maps</a>`)}
        ${row("For", esc(EVENT.audience))}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 36px">
      <p style="margin:0;color:#b9b3a6;font-size:14px;line-height:1.6">
        We will email you again as soon as the date and time are confirmed.
        If your plans change, reply directly to this email.
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Hello ${name}, your place is confirmed.\n\n` +
    `${EVENT.name} — ${EVENT.host}\n` +
    `Date: ${EVENT.date}\nTime: ${EVENT.time}\nLocation: ${EVENT.location}\nMap: ${EVENT.mapUrl}\nFor: ${EVENT.audience}\n\n` +
    `We will email you again as soon as the date and time are confirmed.`;

  return { html, text };
}

/** Enviar email vía Gmail SMTP */
async function sendGmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");

  if (!user || !pass) {
    console.error("Faltan SMTP_USER o SMTP_PASS en Secrets.");
    return false;
  }

  const client = new SmtpClient();
  try {
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: user,
      password: pass,
    });

    await client.send({
      from: `Shaolin Kung Fu <${user}>`,
      to,
      subject,
      content: text,
      html,
    });

    await client.close();
    return true;
  } catch (error) {
    console.error("Error enviando por Gmail SMTP:", error);
    return false;
  }
}

// ---------- Handler principal ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Honeypot anti-bots
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true });

  const fullName = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
  const email = String(body.email ?? "").trim().toLowerCase();
  const status = String(body.status ?? "");
  const message = String(body.message ?? "").trim();

  if (fullName.length < 2 || fullName.length > 80) return json({ ok: false, error: "Enter your full name (2–80 characters)." }, 422);
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) return json({ ok: false, error: "Enter a valid email address, or leave it empty." }, 422);
  if (status !== "attending" && status !== "not_attending") return json({ ok: false, error: "Choose whether you will attend." }, 422);
  if (message.length > 500) return json({ ok: false, error: "Your note is too long (500 characters max)." }, 422);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let confirmationAlreadySent = false;

  // 1. Guardar en Base de Datos
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
    const likeName = fullName.replace(/[\\%_]/g, "\\$&");
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

  // 2. Email al asistente (si asiste y proporcionó correo)
  let emailSent = false;
  if (email && status === "attending" && !confirmationAlreadySent) {
    const { html, text } = confirmationEmail(fullName);
    emailSent = await sendGmail(email, `You're confirmed · ${EVENT.name}`, html, text);
    if (emailSent) {
      await db.from("rsvps").update({ confirmation_sent_at: new Date().toISOString() }).eq("email", email);
    }
  }

  // 3. Notificación a tu Gmail (shaolin.zurich@gmail.com)
  const organizerEmail = Deno.env.get("ORGANIZER_EMAIL") || "shaolin.zurich@gmail.com";
  const statusBadge = status === "attending" ? "✅ ASISTIRÁ" : "❌ NO ASISTIRÁ";

  const notifHtml = `
    <div style="font-family: Arial, sans-serif; padding: 24px; background: #171510; color: #efe8da; border-radius: 8px;">
      <h2 style="color: #c5a059; margin-top: 0;">Nueva respuesta recibida</h2>
      <p style="margin: 8px 0;"><strong>Nombre:</strong> ${esc(fullName)}</p>
      <p style="margin: 8px 0;"><strong>Correo:</strong> ${email ? esc(email) : "No indicó correo"}</p>
      <p style="margin: 8px 0;"><strong>Estado:</strong> <span style="font-weight: bold; color: #efe8da;">${statusBadge}</span></p>
      <p style="margin: 8px 0;"><strong>Nota / Mensaje:</strong> ${message ? esc(message) : "Ninguna"}</p>
      <hr style="border: none; border-top: 1px solid #2e2a22; margin: 20px 0;">
      <p style="font-size: 12px; color: #8c867a; margin: 0;">Registro guardado en Supabase.</p>
    </div>
  `;
  const notifText = `Nueva respuesta:\nNombre: ${fullName}\nCorreo: ${email || "Ninguno"}\nEstado: ${statusBadge}\nNota: ${message || "Ninguna"}`;

  await sendGmail(organizerEmail, `[RSVP] ${fullName} · ${statusBadge}`, notifHtml, notifText);

  return json({ ok: true, status, emailSent });
});