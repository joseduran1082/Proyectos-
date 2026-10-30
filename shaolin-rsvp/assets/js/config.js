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


  // Datos del evento. Si la base de datos tiene las tablas event_sessions / event_notes (ver schema.sql),
  // la web usa ESAS filas y estos valores solo sirven de respaldo (modo demo o si la lectura falla).
  EVENT: {
    sessions: [
      { day: "Thursday 5 November", hours: "12:00 – 13:00" },
      { day: "Saturday 7 November", hours: "17:00 – 18:00" },
    ],
    price: ["Two introductory lessons free", "20 Fr for every next lesson"],
    reminders: [
      "Black long pants and black shirt",
      "Clean shoes for the room",
      "Parking is hard",
      "Class starts on time",
    ],
    location: "Badenerstrasse 569, 8048 Zürich",
    mapUrl: "https://maps.app.goo.gl/KQB4Q64DLjS6X7df7",
    audience: "All levels welcome",
  },
};
