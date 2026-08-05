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

  function fmtDate(value) {
    if (!value) return "";
    // MySQL DATETIME "2026-08-05 14:30:00" → válido en todos los navegadores.
    const d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    // Formato fijo dd/mm (no dependemos del locale, que a veces ignora 2-digit).
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm;
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  /* --- Render --- */

  function couponCard(c) {
    const article = document.createElement("article");
    const redeemed = c.status === "redeemed";
    article.className = "coupon-card " + (redeemed ? "is-redeemed" : "is-available");

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
    const date = fmtDate(c.createdAt);
    sub.textContent = [c.source, date].filter(Boolean).join(" · ");
    meta.append(label, sub);

    const status = document.createElement("span");
    status.className = "coupon-status";
    status.textContent = redeemed ? "Canjeado" : "Disponible";

    top.append(icon, meta, status);
    article.append(top);

    const codeRow = document.createElement("div");
    codeRow.className = "coupon-code-row";
    const code = document.createElement("code");
    code.className = "coupon-code";
    code.textContent = c.code;
    codeRow.append(code);

    if (!redeemed) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "coupon-copy";
      copy.textContent = "Copiar";
      copy.addEventListener("click", () => copyCode(c.code, copy));
      codeRow.append(copy);
    }
    article.append(codeRow);

    if (redeemed && c.redeemedAt) {
      const when = document.createElement("p");
      when.className = "coupon-redeemed-at";
      when.textContent = "Canjeado el " + fmtDate(c.redeemedAt);
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
