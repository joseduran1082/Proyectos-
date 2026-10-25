/* =====================================================================
 *  CONFIGURACIÓN  —  único archivo que tienes que editar en el frontend
 * ---------------------------------------------------------------------
 *  SUPABASE_URL       Supabase → Project Settings → API → Project URL
 *  SUPABASE_ANON_KEY  Supabase → Project Settings → API → anon / publishable key
 *                     (es PÚBLICA por diseño; la seguridad la dan las reglas RLS del schema.sql.
 *                      NUNCA pongas aquí la service_role ni la clave de Resend.)
 *
 *  Mientras los valores contengan "YOUR_", la web funciona en MODO DEMO:
 *  las respuestas se guardan solo en tu navegador (localStorage) y no se envía email.
 * ===================================================================== */
window.RSVP_CONFIG = {
  SUPABASE_URL: "https://sykwvhyhyqjkodwmtmif.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_A3CzTfpndcwDEjIHHd_KHA_S2fDKwc5",

  // Nombre de la Edge Function desplegada (carpeta supabase/functions/rsvp)
  FUNCTION_NAME: "rsvp",

  // Cada cuántos ms se refresca la lista de asistentes mientras la pestaña está visible
  POLL_MS: 15000,

  // Datos del evento que se muestran en la página.
  // (El email usa los mismos datos, definidos como variables EVENT_* de la Edge Function: ver README.)
  EVENT: {
    date: "To be announced soon",
    time: "To be announced soon",
    location: "Badenerstrasse 569, 8048 Zürich",
    mapUrl: "https://maps.app.goo.gl/KQB4Q64DLjS6X7df7",
    audience: "All levels welcome",
  },
};
