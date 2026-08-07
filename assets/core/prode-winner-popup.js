(() => {
  "use strict";

  /* =========================================================
     BYR Club — Popup de "¡Ganaste la fecha del Prode!"
     ---------------------------------------------------------
     Tarjeta flotante que aparece apenas el socio entra
     (logueado) si ganó la última fecha del Prode y tiene su
     cupón esperando. Le muestra el premio y el código para
     canjear, con botón de copiar.

     No necesita backend nuevo: el cupón del ganador ya lo crea
     el server al cerrar la fecha (redemptions con
     prize_id = "prode-winner"). Acá solo leemos /api/redemptions.php
     y, si hay un cupón de ganador pendiente que todavía no se
     mostró en este navegador, lo festejamos.

     Se muestra una sola vez por código (por navegador); después
     el cupón queda siempre en "Mis cupones". Componente autónomo:
     inyecta sus propios estilos.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const DISMISS_KEY = "byrclub_prode_winner_popup_v1"; // guarda el último code festejado
  const API_URL = "/api/redemptions.php";
  const STYLE_ID = "byr-prode-win-styles";
  const WINNER_PRIZE_ID = "prode-winner";

  /* --- Guardas rápidas --- */

  function loggedIn() {
    try {
      return Boolean(localStorage.getItem(SESSION_KEY));
    } catch (error) {
      return false;
    }
  }

  function alreadyCelebrated(code) {
    try {
      return localStorage.getItem(DISMISS_KEY) === code;
    } catch (error) {
      return false;
    }
  }

  function markCelebrated(code) {
    try {
      localStorage.setItem(DISMISS_KEY, code);
    } catch (error) {
      /* noop */
    }
  }

  if (!loggedIn()) return;

  /* --- Estilos --- */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .byrwin-pop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;
        background:rgba(2,6,28,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .28s ease}
      .byrwin-pop.is-open{opacity:1}
      .byrwin-card{position:relative;width:min(430px,100%);padding:34px 28px 26px;border-radius:26px;text-align:center;color:#071342;
        background:radial-gradient(circle at 88% 8%,rgba(255,255,255,.55),transparent 42%),linear-gradient(150deg,#ffe259,#ffbf1f 55%,#ff9d00);
        border:2px solid rgba(255,255,255,.85);box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden;
        transform:translateY(18px) scale(.94);transition:transform .3s cubic-bezier(.2,.9,.25,1.2)}
      .byrwin-pop.is-open .byrwin-card{transform:translateY(0) scale(1)}
      .byrwin-close{position:absolute;top:12px;right:14px;width:38px;height:38px;border:0;border-radius:50%;
        background:rgba(7,19,66,.14);color:#071342;font-size:1.6rem;line-height:1;cursor:pointer;z-index:2}
      .byrwin-close:hover{background:rgba(7,19,66,.26)}
      .byrwin-trophy{font-size:3.6rem;line-height:1;filter:drop-shadow(0 6px 10px rgba(0,0,0,.3))}
      .byrwin-card h2{margin:10px 0 0;font-family:"Lilita One",sans-serif;font-size:2.1rem;line-height:1;text-transform:uppercase;
        color:#7a3b00;text-shadow:0 2px 0 rgba(255,255,255,.5)}
      .byrwin-round{display:inline-block;margin:10px 0 0;padding:5px 14px;border-radius:999px;background:#071342;color:#ffd51f;
        font-family:"Lilita One",sans-serif;font-size:1rem;letter-spacing:.03em}
      .byrwin-card p{margin:12px auto 6px;max-width:340px;font-weight:800;color:#3a2a00;line-height:1.4}
      .byrwin-prize{margin:6px auto 18px;max-width:340px;font-family:"Lilita One",sans-serif;font-size:1.25rem;color:#7a3b00}
      .byrwin-codebox{display:flex;align-items:stretch;gap:9px;margin:0 0 6px}
      .byrwin-codebox strong{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px 8px;border-radius:13px;
        background:#02092d;border:2px dashed rgba(255,211,30,.7);
        font-family:"Courier New",monospace;font-size:1.5rem;font-weight:700;letter-spacing:.12em;color:#ffd94a;overflow-x:auto;user-select:all}
      .byrwin-copy{flex-shrink:0;padding:0 16px;border:0;border-radius:13px;background:#071342;color:#ffd51f;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #030a24;transition:transform .15s}
      .byrwin-copy:hover{transform:translateY(-2px)}
      .byrwin-copy.copied{background:#53e87d;box-shadow:0 4px 0 #1c8a44;color:#06251a}
      .byrwin-hint{margin:2px auto 16px;max-width:340px;font-size:.85rem;font-weight:700;color:#5a4300}
      .byrwin-secondary{padding:12px;border:0;background:transparent;color:#5a3600;font-weight:900;cursor:pointer;text-decoration:underline}
      @media(prefers-reduced-motion:reduce){.byrwin-pop,.byrwin-card{transition:none}}
    `;
    document.head.appendChild(style);
  }

  /* --- Modal --- */

  let overlay = null;

  function close(code) {
    if (code) markCelebrated(code);
    if (!overlay) return;
    overlay.classList.remove("is-open");
    const el = overlay;
    overlay = null;
    window.setTimeout(() => el.remove(), 280);
  }

  function copyCode(code, button) {
    const done = () => {
      button.textContent = "¡Copiado!";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = "Copiar";
        button.classList.remove("copied");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(done);
    } else {
      done();
    }
  }

  /* La etiqueta del cupón viene como "Premio · Ganador Fecha N".
     La partimos para mostrar el premio y la fecha por separado. */
  function splitLabel(label) {
    const parts = String(label || "").split(" · ");
    if (parts.length >= 2) {
      return { prize: parts[0].trim(), round: parts.slice(1).join(" · ").trim() };
    }
    return { prize: String(label || "").trim(), round: "" };
  }

  function openModal(coupon) {
    injectStyles();
    const { prize, round } = splitLabel(coupon.label);
    const code = coupon.code;

    overlay = document.createElement("div");
    overlay.className = "byrwin-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Ganaste la fecha del Prode");

    const card = document.createElement("div");
    card.className = "byrwin-card";
    card.innerHTML = `
      <button type="button" class="byrwin-close" aria-label="Cerrar">×</button>
      <span class="byrwin-trophy" aria-hidden="true">🏆</span>
      <h2>¡Ganaste la fecha!</h2>
      ${round ? `<span class="byrwin-round"></span>` : ""}
      <p>Fuiste el mejor pronosticador del Prode BYR. Este es tu premio:</p>
      <div class="byrwin-prize"></div>
      <div class="byrwin-codebox">
        <strong class="byrwin-code"></strong>
        <button type="button" class="byrwin-copy">Copiar</button>
      </div>
      <p class="byrwin-hint">Mostrá este código en el local o pasalo al pedir por delivery. Ya quedó guardado en Mis cupones.</p>
      <button type="button" class="byrwin-secondary">Listo, cerrar</button>
    `;
    overlay.append(card);
    document.body.append(overlay);

    /* Textos por textContent (evita inyección desde datos del server). */
    if (round) card.querySelector(".byrwin-round").textContent = round;
    card.querySelector(".byrwin-prize").textContent = prize || "Tu premio de ganador";
    card.querySelector(".byrwin-code").textContent = code;

    card.querySelector(".byrwin-copy").addEventListener("click", (e) => copyCode(code, e.currentTarget));
    card.querySelector(".byrwin-close").addEventListener("click", () => close(code));
    card.querySelector(".byrwin-secondary").addEventListener("click", () => close(code));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(code);
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close(code);
        document.removeEventListener("keydown", onKey);
      }
    });

    requestAnimationFrame(() => overlay && overlay.classList.add("is-open"));
  }

  /* --- Arranque --- */

  async function start() {
    let data;
    try {
      const res = await fetch(API_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      data = await res.json();
    } catch (error) {
      return; // sin conexión / sin PHP: no molestamos
    }

    const coupons = (data && Array.isArray(data.coupons)) ? data.coupons : [];
    // El más nuevo primero: redemptions.php ya ordena pendientes arriba.
    const win = coupons.find(
      (c) => c && c.prizeId === WINNER_PRIZE_ID && c.status === "pending"
    );
    if (!win || !win.code) return;
    if (alreadyCelebrated(win.code)) return;

    openModal(win);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
