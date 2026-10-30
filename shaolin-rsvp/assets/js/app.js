/* =====================================================================
 *  app.js  —  interfaz: datos del evento, modal y validación
 *  Depende de: config.js (window.RSVP_CONFIG) y api.js (window.RsvpApi)
 * ===================================================================== */
(function () {
  "use strict";

  var cfg = window.RSVP_CONFIG;
  var api = window.RsvpApi;

  /* ---------- Helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, value) { // localStorage seguro (puede estar bloqueado)
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  /* ---------- Textos del modal según la opción elegida ---------- */
  var COPY = {
    attending: {
      title: "I will attend",
      lead: "Leave your name to confirm your place. Add your email only if you would like to receive the invitation by email.",
      submit: "Confirm attendance",
    },
    not_attending: {
      title: "I will not attend",
      lead: "Let the host know. You can change your answer later by replying again with the same name or email.",
      submit: "Send reply",
    },
  };

  /* ---------- Referencias al DOM ---------- */
  var dialog = $("#rsvpDialog");
  var form = $("#rsvpForm");
  var viewForm = $("#viewForm");
  var viewDone = $("#viewDone");
  var fields = {
    name: $("#fName"),
    email: $("#fEmail"),
    message: $("#fMessage"),
    website: $("#fWebsite"), // honeypot
  };
  var submitBtn = $("#submitBtn");
  var formError = $("#formError");
  var counter = $("#msgCount");

  var choice = "attending";
  var lastOpener = null;

  /* ---------- Datos del evento en la página ---------- */
  function lines(el, items) {
    el.textContent = "";
    items.forEach(function (t) {
      var span = document.createElement("span");
      span.className = "block";
      span.textContent = t;
      el.appendChild(span);
    });
  }

  function renderEvent(info) {
    if (info.location) {
      $$('[data-event="location"]').forEach(function (el) { el.textContent = info.location; });
    }
    var sessions = (info.sessions || []).filter(function (x) { return x && x.day; });
    if (sessions.length) {
      lines($("#evDays"), sessions.map(function (x) { return x.day; }));
      lines($("#evHours"), sessions.map(function (x) { return x.hours || ""; }));
    }

    var price = info.price || [];
    var priceUl = $("#priceList");
    priceUl.textContent = "";
    price.forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = i === 0 ? "text-[1.15rem] text-bone" : "text-[1.15rem] text-gold";
      li.textContent = t;
      priceUl.appendChild(li);
    });
    $("#priceBlock").hidden = !price.length;

    var rem = info.reminders || [];
    var remOl = $("#reminderList");
    remOl.textContent = "";
    rem.forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = "flex gap-3 text-[1rem] leading-snug text-bone/90";
      var n = document.createElement("span");
      n.className = "w-4 flex-none text-gold";
      n.textContent = String(i + 1);
      var txt = document.createElement("span");
      txt.textContent = t;
      li.appendChild(n);
      li.appendChild(txt);
      remOl.appendChild(li);
    });
    $("#reminderBlock").hidden = !rem.length;
    $("#infoSection").hidden = !price.length && !rem.length;
  }

  function fillEvent() {
    var ev = cfg.EVENT || {};
    $$("[data-event]").forEach(function (el) {
      var v = ev[el.getAttribute("data-event")];
      if (v) el.textContent = v;
    });
    $$("[data-event-map]").forEach(function (a) { if (ev.mapUrl) a.href = ev.mapUrl; });

    renderEvent(ev); // 1) valores de respaldo de config.js (se ven al instante)

    // 2) datos reales de la base de datos; si algo falla o está vacío, se queda lo anterior
    if (window.RsvpApi && !window.RsvpApi.isDemo) {
      window.RsvpApi.eventInfo().then(function (info) {
        if (!info) return;
        var merged = {
          sessions: info.sessions && info.sessions.length ? info.sessions : ev.sessions,
          price: info.price && info.price.length ? info.price : ev.price,
          reminders: info.reminders && info.reminders.length ? info.reminders : ev.reminders,
          location: info.location || ev.location,
        };
        renderEvent(merged);
      }).catch(function () { /* se mantiene el respaldo */ });
    }
  }

  /* =====================================================================
   *  Modal
   * ===================================================================== */
  function setError(input, msg) {
    var err = $("#" + input.id + "Err");
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    err.textContent = msg || "";
  }

  function resetForm() {
    ["name", "email", "message"].forEach(function (k) { setError(fields[k], ""); });
    formError.hidden = true;
    formError.textContent = "";
    submitBtn.disabled = false;
    submitBtn.textContent = COPY[choice].submit;
    viewForm.hidden = false;
    viewDone.hidden = true;
  }

  function openDialog(which, opener) {
    choice = which;
    lastOpener = opener || null;
    var c = COPY[choice];
    $("#dlgTitle").textContent = c.title;
    $("#dlgLead").textContent = c.lead;
    dialog.setAttribute("data-choice", choice);

    // Prellenar con lo último que usó este visitante (solo en su navegador)
    if (!fields.name.value) fields.name.value = store("shaolin_name") || "";
    if (!fields.email.value) fields.email.value = store("shaolin_email") || "";
    updateCounter();
    resetForm();
    dialog.showModal();
  }

  function closeDialog() { dialog.close(); }

  function updateCounter() {
    counter.textContent = fields.message.value.length + " / 500";
  }

  function validate() {
    var ok = true;
    var name = fields.name.value.trim().replace(/\s+/g, " ");
    var email = fields.email.value.trim();

    if (name.length < 2) { setError(fields.name, "Enter your full name."); ok = false; } else setError(fields.name, "");
    // El email es opcional: solo se valida el formato si la persona escribió algo.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError(fields.email, "Enter a valid email address, like name@example.com, or leave it empty."); ok = false; } else setError(fields.email, "");
    if (fields.message.value.length > 500) { setError(fields.message, "Keep your note under 500 characters."); ok = false; } else setError(fields.message, "");

    if (!ok) {
      var first = $("[aria-invalid='true']", form);
      if (first) first.focus();
    }
    return ok;
  }

  function showDone(res, name, email) {
    var title = $("#doneTitle"), text = $("#doneText"), note = $("#doneNote");
    note.hidden = true;

    if (choice === "attending") {
      title.textContent = "You are confirmed";
      text.textContent = "Thank you, " + name + ". We have saved your place.";
      if (res.demo) { note.textContent = email ? "Demo mode: no email was sent and your reply stays in this browser." : "Demo mode: your reply stays in this browser."; note.hidden = false; }
      else if (res.emailSent) { note.textContent = "Your invitation is on its way to " + email + ". Check your spam folder if it does not arrive."; note.hidden = false; }
      else if (res.emailAttempted) { note.textContent = "Your place is saved, but we could not send the invitation email. Keep this page for reference."; note.hidden = false; }
    } else {
      title.textContent = "Reply sent";
      text.textContent = "Thanks for letting us know, " + name + ". If your plans change, answer again with the same email.";
      if (res.demo) { note.textContent = "Demo mode: your reply stays in this browser."; note.hidden = false; }
    }
    viewForm.hidden = true;
    viewDone.hidden = false;
    $("#doneClose").focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    var name = fields.name.value.trim().replace(/\s+/g, " ");
    var email = fields.email.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    formError.hidden = true;

    api.submit({
      full_name: name,
      email: email,
      status: choice,
      message: fields.message.value.trim(),
      website: fields.website.value, // honeypot: debe ir vacío
    }).then(function (res) {
      store("shaolin_name", name);
      store("shaolin_email", email); // puede ser "" (email opcional)
      fields.message.value = "";
      showDone(res, name, email);
    }).catch(function (err) {
      formError.textContent = err.message || "Could not send your reply. Try again.";
      formError.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = COPY[choice].submit;
    });
  }

  /* =====================================================================
   *  Arranque
   * ===================================================================== */
  function init() {
    fillEvent();

    if (api.isDemo) $("#demoBar").hidden = false;

    $$("[data-rsvp]").forEach(function (btn) {
      btn.addEventListener("click", function () { openDialog(btn.getAttribute("data-rsvp"), btn); });
    });

    form.addEventListener("submit", onSubmit);
    fields.message.addEventListener("input", updateCounter);
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeDialog); });

    // Clic en el fondo oscuro (fuera del panel) cierra el modal
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDialog(); });
    // Al cerrar (botón, Esc o fondo) devolver el foco al botón que lo abrió
    dialog.addEventListener("close", function () { if (lastOpener) lastOpener.focus(); });

  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
