(() => {
  "use strict";

  /* =========================================================
     BYR Club — "Mis cupones"
     ---------------------------------------------------------
     Trae los vales de premio del socio desde /api/redemptions.php
     (la MISMA tabla que valida el admin) y los muestra en el perfil
     con su código, un botón para copiar y el estado real
     (Disponible / Canjeado). Así el cliente ya no pierde el código
     si no saca captura.
  ========================================================= */

  const API_URL = "/api/redemptions.php";

  const section = document.querySelector("[data-coupons-section]");
  if (!section) return;

  const grid = section.querySelector("[data-coupons-grid]");
  const emptyEl = section.querySelector("[data-coupons-empty]");
  const errorEl = section.querySelector("[data-coupons-error]");

  /* --- Utilidades --- */

  /* Fecha para mostrar. Si el servidor mandó la etiqueta ya hecha se usa esa
     (viene en hora de Argentina). El respaldo lee el valor de la base como
     UTC, que es como está guardado: sin la "Z", el navegador lo tomaba como
     hora local y cerca de medianoche mostraba el día siguiente. */
  function fmtDate(value, label) {
    if (label) return label;
    if (!value) return "";
    // Sin la "Z" el navegador lo tomaba como hora local, pero la base guarda
    // en UTC: cerca de medianoche mostraba el día siguiente.
    const d = new Date(String(value).replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return "";
    // A mano y no con toLocaleDateString: es-AR ignora el "2-digit" del mes.
    const p = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit",
    }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return p.day + "/" + p.month;
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  /* --- Contador de vencimiento (24hs) ---
     El server nos manda secondsLeft (segundos que faltan según SU reloj), así
     el contador no depende de la hora del celular. Lo anclamos a un instante
     local y desde ahí descontamos con un único setInterval para todas las
     tarjetas. Cuando llega a 0, la tarjeta pasa a "Vencido" sola. */

  const timers = new Set();
  let ticker = null;

  function fmtCountdown(secs) {
    if (secs >= 86400) {
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      return "Vence en " + d + "d " + h + "h";
    }
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return "Vence en " + h + "h " + m + "m";
    }
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return "Vence en " + m + "m " + s + "s";
    }
    return "Vence en " + secs + "s";
  }

  function tick() {
    const now = Date.now();
    timers.forEach((t) => {
      const remaining = Math.ceil((t.deadline - now) / 1000);
      if (remaining <= 0) {
        expireCard(t);
        timers.delete(t);
      } else {
        t.el.textContent = fmtCountdown(remaining);
        t.el.classList.toggle("is-urgent", remaining < 3600);
      }
    });
    if (timers.size === 0 && ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }

  function startTicker() {
    if (!ticker && timers.size > 0) {
      ticker = window.setInterval(tick, 1000);
    }
  }

  // Convierte una tarjeta disponible en "Vencido" sin recargar.
  function expireCard(t) {
    const card = t.card;
    card.classList.remove("is-available");
    card.classList.add("is-expired");
    if (t.statusEl) t.statusEl.textContent = "Vencido";
    if (t.copyBtn) t.copyBtn.remove();
    t.el.classList.remove("is-urgent");
    t.el.classList.add("is-expired-note");
    t.el.textContent = "Cupón vencido";
  }

  /* --- Render --- */

  function couponCard(c) {
    const article = document.createElement("article");
    const redeemed = c.status === "redeemed";
    // Vencido = pendiente cuyo plazo ya pasó (el server ya lo marca, pero
    // también nos cubrimos si secondsLeft llegó a 0 recién).
    const expired = !redeemed &&
      (c.expired === true || (typeof c.secondsLeft === "number" && c.secondsLeft <= 0));
    const available = !redeemed && !expired;
    // ¿Tiene contador? Solo los disponibles con vencimiento (secondsLeft != null).
    const hasCountdown = available && typeof c.secondsLeft === "number";

    let stateClass = "is-available";
    if (redeemed) stateClass = "is-redeemed";
    else if (expired) stateClass = "is-expired";
    article.className = "coupon-card " + stateClass;

    const top = document.createElement("div");
    top.className = "coupon-top";

    const icon = document.createElement("span");
    icon.className = "coupon-icon";
    icon.textContent = c.icon || "🎟️";

    const meta = document.createElement("div");
    meta.className = "coupon-meta";
    const label = document.createElement("b");
    label.textContent = c.label || "Premio";
    const sub = document.createElement("span");
    const date = fmtDate(c.createdAt, c.createdAtLabel);
    sub.textContent = [c.source, date].filter(Boolean).join(" · ");
    meta.append(label, sub);

    const status = document.createElement("span");
    status.className = "coupon-status";
    status.textContent = redeemed ? "Canjeado" : (expired ? "Vencido" : "Disponible");

    top.append(icon, meta, status);
    article.append(top);

    const codeRow = document.createElement("div");
    codeRow.className = "coupon-code-row";
    const code = document.createElement("code");
    code.className = "coupon-code";
    code.textContent = c.code;
    codeRow.append(code);

    let copyBtn = null;
    if (available) {
      copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "coupon-copy";
      copyBtn.textContent = "Copiar";
      copyBtn.addEventListener("click", () => copyCode(c.code, copyBtn));
      codeRow.append(copyBtn);
    }
    article.append(codeRow);

    // Contador regresivo en vivo para los disponibles con vencimiento.
    if (hasCountdown) {
      const cd = document.createElement("p");
      cd.className = "coupon-countdown";
      const secs = Math.max(0, c.secondsLeft);
      cd.textContent = fmtCountdown(secs);
      if (secs < 3600) cd.classList.add("is-urgent");
      article.append(cd);
      // Anclamos el vencimiento a un instante local: no volvemos a confiar en
      // el reloj del celular, solo en el delta desde ahora.
      timers.add({
        el: cd,
        deadline: Date.now() + secs * 1000,
        card: article,
        statusEl: status,
        copyBtn: copyBtn,
      });
    } else if (expired) {
      const note = document.createElement("p");
      note.className = "coupon-countdown is-expired-note";
      note.textContent = "Cupón vencido";
      article.append(note);
    }

    if (redeemed && c.redeemedAt) {
      const when = document.createElement("p");
      when.className = "coupon-redeemed-at";
      when.textContent = "Canjeado el " + fmtDate(c.redeemedAt, c.redeemedAtLabel);
      article.append(when);
    }

    return article;
  }

  function copyCode(text, button) {
    const done = () => {
      const original = button.textContent;
      button.textContent = "¡Copiado!";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (error) {
      /* si ni así se puede, el código está a la vista para copiarlo a mano */
    }
  }

  function render(coupons) {
    grid.textContent = "";
    // Reiniciamos los contadores: las tarjetas anteriores ya no existen.
    timers.clear();
    show(errorEl, false);

    if (!coupons.length) {
      show(grid, false);
      show(emptyEl, true);
      return;
    }
    show(emptyEl, false);
    show(grid, true);

    const frag = document.createDocumentFragment();
    coupons.forEach((c) => frag.append(couponCard(c)));
    grid.append(frag);

    startTicker();
  }

  /* --- Carga --- */

  async function load() {
    let data;
    try {
      const res = await fetch(API_URL, { credentials: "same-origin" });
      if (res.status === 401) {
        // Sin sesión: no mostramos nada (la página igual está protegida).
        section.hidden = true;
        return;
      }
      data = await res.json();
    } catch (error) {
      show(grid, false);
      show(emptyEl, false);
      show(errorEl, true);
      return;
    }

    render(Array.isArray(data.coupons) ? data.coupons : []);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }

  // Si el estado del usuario se actualiza (p. ej. sync desde otro dispositivo),
  // reconsultamos por si canjearon un vale mientras tanto.
  window.addEventListener("byr:user-updated", load);
})();
