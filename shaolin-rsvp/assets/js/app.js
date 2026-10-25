/* =====================================================================
 *  app.js  —  interfaz: modal, validación, listas en vivo
 *  Depende de: config.js (window.RSVP_CONFIG) y api.js (window.RsvpApi)
 * ===================================================================== */
(function () {
  "use strict";

  var cfg = window.RSVP_CONFIG;
  var api = window.RsvpApi;

  /* ---------- Helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, value) {
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

  /* ---------- Carga dinámica de fecha y hora desde Supabase ---------- */
  function loadLiveEventDetails() {
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

    var endpoint = cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/event_settings?id=eq.1&select=event_date,event_time,event_location";

    fetch(endpoint, {
      method: "GET",
      headers: {
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (rows) {
        if (!rows || rows.length === 0) return;
        var data = rows[0];

        var dateEl = $('[data-event="date"]');
        var timeEl = $('[data-event="time"]');
        var locEl = $('[data-event="location"]');

        if (dateEl && data.event_date) dateEl.textContent = data.event_date;
        if (timeEl && data.event_time) timeEl.textContent = data.event_time;
        if (locEl && data.event_location) locEl.textContent = data.event_location;
      })
      .catch(function (err) {
        console.warn("Could not load dynamic event settings from Supabase:", err);
      });
  }

  /* ---------- Datos iniciales de reserva ---------- */
  function fillEvent() {
    var ev = cfg.EVENT || {};
    $$("[data-event]").forEach(function (el) {
      var v = ev[el.getAttribute("data-event")];
      if (v) el.textContent = v;
    });
    $$("[data-event-map]").forEach(function (a) { if (ev.mapUrl) a.href = ev.mapUrl; });
  }

  /* =====================================================================
   *  Listas Attending / Not attending
   * ===================================================================== */
  var seen = null;

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function renderList(ul, countEl, emptyEl, rows) {
    ul.textContent = "";
    rows.forEach(function (r) {
      var key = r.full_name + "|" + r.created_at;
      var li = document.createElement("li");
      li.className = "guest";
      li.textContent = r.full_name;
      li.title = "Replied " + fmtDate(r.created_at);
      if (seen && !seen.has(key)) li.classList.add("guest-new");
      ul.appendChild(li);
    });
    countEl.textContent = rows.length;
    emptyEl.hidden = rows.length > 0;
  }

  function refreshLists() {
    return api.list().then(function (rows) {
      var yes = rows.filter(function (r) { return r.status === "attending"; });
      var no = rows.filter(function (r) { return r.status === "not_attending"; });
      renderList($("#listYes"), $("#countYes"), $("#emptyYes"), yes);
      renderList($("#listNo"), $("#countNo"), $("#emptyNo"), no);
      seen = new Set(rows.map(function (r) { return r.full_name + "|" + r.created_at; }));
      $("#listsError").hidden = true;
    }).catch(function () {
      $("#listsError").hidden = false;
    });
  }

  var pollTimer = null;
  function startPolling() {
    stopPolling();
    if (!cfg.POLL_MS) return;
    pollTimer = setInterval(function () { if (!document.hidden && !dialog.open) refreshLists(); }, cfg.POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

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
      website: fields.website.value,
    }).then(function (res) {
      store("shaolin_name", name);
      store("shaolin_email", email);
      fields.message.value = "";
      showDone(res, name, email);
      return refreshLists();
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
    loadLiveEventDetails();

    if (api.isDemo) $("#demoBar").hidden = false;

    $$("[data-rsvp]").forEach(function (btn) {
      btn.addEventListener("click", function () { openDialog(btn.getAttribute("data-rsvp"), btn); });
    });

    form.addEventListener("submit", onSubmit);
    fields.message.addEventListener("input", updateCounter);
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeDialog); });

    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDialog(); });
    dialog.addEventListener("close", function () { if (lastOpener) lastOpener.focus(); });

    refreshLists().then(startPolling);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !dialog.open) refreshLists(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();