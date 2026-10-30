/* =====================================================================
 *  api.js  —  capa de datos
 *  Expone window.RsvpApi = { isDemo, eventInfo(), submit(payload) }
 *
 *  Modo real : habla con Supabase por HTTP (sin librerías):
 *              · eventInfo() -> RPC pública get_event_info (días, horas, precio, avisos, lugar)
 *              · submit() -> Edge Function "rsvp" (guarda y envía el email)
 *  Modo demo : localStorage, para probar la interfaz sin backend.
 * ===================================================================== */
(function () {
  "use strict";

  var cfg = window.RSVP_CONFIG || {};
  var isDemo = !cfg.SUPABASE_URL || /YOUR_/.test(cfg.SUPABASE_URL) || /YOUR_/.test(cfg.SUPABASE_ANON_KEY || "");

  var GENERIC_ERROR = "Could not reach the server. Check your connection and try again.";

  /* ---------- Modo real ---------- */

  function headers() {
    var key = cfg.SUPABASE_ANON_KEY;
    var h = { "Content-Type": "application/json", apikey: key };
    // Las claves antiguas (anon) son JWT y se envían también como Bearer.
    // Las nuevas "sb_publishable_…" no son JWT y solo van en el header apikey.
    if (/^eyJ/.test(key)) h.Authorization = "Bearer " + key;
    return h;
  }

  /** fetch con timeout y errores legibles. Devuelve el JSON o lanza Error(mensaje para el usuario). */
  function request(url, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);
    return fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body || {}), signal: ctrl.signal })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok || (data && data.ok === false)) {
            throw new Error((data && data.error) || "Something went wrong. Try again in a moment.");
          }
          return data;
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") throw new Error(GENERIC_ERROR);
        if (err instanceof TypeError) throw new Error(GENERIC_ERROR); // fallo de red / CORS
        throw err;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* ---------- Modo demo ---------- */

  var DEMO_KEY = "shaolin_rsvp_demo";
  var memory = []; // respaldo si localStorage no está disponible

  function demoRead() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch (e) { return memory; }
  }
  function demoWrite(rows) {
    memory = rows;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); } catch (e) { /* sin storage: queda en memoria */ }
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- API pública ---------- */

  window.RsvpApi = {
    isDemo: isDemo,

    /** -> Promise<{ sessions:[{day,hours}], price:[], reminders:[] } | null>  (null en demo o si no hay datos) */
    eventInfo: function () {
      if (isDemo) return Promise.resolve(null);
      return request(cfg.SUPABASE_URL + "/rest/v1/rpc/get_event_info", {});
    },

    /** payload: { full_name, email, status, message, website } -> Promise<{ ok, emailAttempted, emailSent }> */
    submit: function (payload) {
      if (isDemo) {
        var email = String(payload.email || "").trim().toLowerCase(); // el email es opcional
        if (email && !EMAIL_RE.test(email)) return Promise.reject(new Error("Enter a valid email address."));
        var name = String(payload.full_name).trim();
        var rows = demoRead();
        // Con email: una respuesta por correo. Sin email: se identifica por nombre.
        var i = rows.findIndex(function (r) {
          return email ? r.email === email : (!r.email && r.full_name.toLowerCase() === name.toLowerCase());
        });
        var row = {
          full_name: name,
          email: email || null,
          status: payload.status,
          message: payload.message || null,
          created_at: i >= 0 ? rows[i].created_at : new Date().toISOString(),
        };
        if (i >= 0) rows[i] = row; else rows.push(row);
        demoWrite(rows);
        return new Promise(function (resolve) {
          setTimeout(function () { resolve({ ok: true, status: payload.status, emailAttempted: false, emailSent: false, demo: true }); }, 450);
        });
      }
      return request(cfg.SUPABASE_URL + "/functions/v1/" + (cfg.FUNCTION_NAME || "rsvp"), payload);
    },
  };
})();
