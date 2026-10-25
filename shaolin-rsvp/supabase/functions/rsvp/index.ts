import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

// ---------- Default event configuration (fallback) ----------
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

// ---------- Utilities ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---------- Email template for the attendee ----------
function confirmationEmail(name: string, eventData: typeof EVENT) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;width:110px;color:#8c867a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;vertical-align:top">${label}</td>
      <td style="padding:10px 0;border-top:1px solid #2e2a22;color:#efe8da;font-size:16px">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#0e0d0b;padding:24px 12px;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#171510">
    <tr><td style="padding:36px 32px 8px">
      <div style="color:#c5a059;font-size:12px;letter-spacing:.2em;text-transform:uppercase">${esc(eventData.host)}</div>
      <h1 style="margin:16px 0 4px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.1;color:#efe8da">${esc(eventData.name)}</h1>
      <p style="margin:18px 0 0;color:#efe8da;font-size:17px;line-height:1.5">Hello ${esc(name)}, your place is confirmed.</p>
    </td></tr>
    <tr><td style="padding:16px 32px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row("Date", esc(eventData.date))}
        ${row("Time", esc(eventData.time))}
        ${row("Location", `${esc(eventData.location)}<br><a href="${esc(eventData.mapUrl)}" style="color:#c5a059">Open in Google Maps</a>`)}
        ${row("For", esc(eventData.audience))}
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
    `${eventData.name} — ${eventData.host}\n` +
    `Date: ${eventData.date}\nTime: ${eventData.time}\nLocation: ${eventData.location}\nMap: ${eventData.mapUrl}\nFor: ${eventData.audience}\n\n` +
    `We will email you again as soon as the date and time are confirmed.`;

  return { html, text };
}

function createTransporter() {
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");

  if (!user || !pass) {
    console.error("Missing SMTP_USER or SMTP_PASS secrets");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });
}

/** Send email via Gmail using Nodemailer */
async function sendGmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const user = Deno.env.get("SMTP_USER");
  const transporter = createTransporter();

  if (!transporter || !user) return false;

  try {
    await transporter.sendMail({
      from: `Shaolin Kung Fu <${user}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error("Error sending email via Gmail Nodemailer:", error);
    return false;
  }
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Anti-bot honeypot field
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

  // Fetch dynamic event settings from Supabase
  const { data: eventConfig } = await db
    .from("event_settings")
    .select("event_date, event_time, event_location")
    .eq("id", 1)
    .maybeSingle();

  const currentEvent = {
    ...EVENT,
    date: eventConfig?.event_date ?? EVENT.date,
    time: eventConfig?.event_time ?? EVENT.time,
    location: eventConfig?.event_location ?? EVENT.location,
  };

  let confirmationAlreadySent = false;

  // 1. Save or update database record
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

  // 2. Confirmation email to the guest (if attending and email was provided)
  let emailSent = false;
  if (email && status === "attending" && !confirmationAlreadySent) {
    const { html, text } = confirmationEmail(fullName, currentEvent);
    emailSent = await sendGmail(email, `You're confirmed · ${currentEvent.name}`, html, text);
    if (emailSent) {
      await db.from("rsvps").update({ confirmation_sent_at: new Date().toISOString() }).eq("email", email);
    }
  }

  // 3. Organizer notification to shaolin.zurich@gmail.com
  const organizerEmail = Deno.env.get("ORGANIZER_EMAIL") || "shaolin.zurich@gmail.com";
  const statusBadge = status === "attending" ? "✅ ATTENDING" : "❌ NOT ATTENDING";

  const notifHtml = `
    <div style="font-family: Arial, sans-serif; padding: 24px; background: #171510; color: #efe8da; border-radius: 8px;">
      <h2 style="color: #c5a059; margin-top: 0;">New RSVP Response Received</h2>
      <p style="margin: 8px 0;"><strong>Name:</strong> ${esc(fullName)}</p>
      <p style="margin: 8px 0;"><strong>Email:</strong> ${email ? esc(email) : "No email provided"}</p>
      <p style="margin: 8px 0;"><strong>Status:</strong> <span style="font-weight: bold; color: #efe8da;">${statusBadge}</span></p>
      <p style="margin: 8px 0;"><strong>Note / Message:</strong> ${message ? esc(message) : "None"}</p>
      <hr style="border: none; border-top: 1px solid #2e2a22; margin: 20px 0;">
      <p style="font-size: 12px; color: #8c867a; margin: 0;">Record stored in Supabase.</p>
    </div>
  `;
  const notifText = `New response:\nName: ${fullName}\nEmail: ${email || "None"}\nStatus: ${statusBadge}\nNote: ${message || "None"}`;

  await sendGmail(organizerEmail, `[RSVP] ${fullName} · ${statusBadge}`, notifHtml, notifText);

  return json({ ok: true, status, emailSent });
});