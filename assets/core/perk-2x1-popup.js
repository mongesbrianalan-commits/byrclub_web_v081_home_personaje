(() => {
  "use strict";

  /* =========================================================
     BYR Club — Popup del 2x1 de socio (miércoles)
     ---------------------------------------------------------
     Modal flotante que aparece apenas el socio entra (logueado),
     SOLO los miércoles, para avisarle que tiene el 2x1 disponible.
     Puede activarlo (genera el código validable) o cerrarlo. Se
     muestra una vez por día por navegador para no molestar; el
     banner del perfil queda como acceso permanente.

     Componente autónomo: se inyecta sus propios estilos, así se
     puede sumar a cualquier página con un solo <script>.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const DISMISS_KEY = "byrclub_2x1_popup_v1";
  const API_URL = "/api/perks/weekly-2x1.php";
  const STYLE_ID = "byr-2x1-popup-styles";

  /* --- Guardas rápidas --- */

  function loggedIn() {
    try {
      return Boolean(localStorage.getItem(SESSION_KEY));
    } catch (error) {
      return false;
    }
  }

  function todayKey() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function dismissedToday() {
    try {
      return localStorage.getItem(DISMISS_KEY) === todayKey();
    } catch (error) {
      return false;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch (error) {
      /* noop */
    }
  }

  if (!loggedIn() || dismissedToday()) return;

  /* --- Estilos --- */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .byr2x1-pop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;
        background:rgba(2,6,28,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .28s ease}
      .byr2x1-pop.is-open{opacity:1}
      .byr2x1-card{position:relative;width:min(430px,100%);padding:34px 28px 26px;border-radius:26px;text-align:center;color:#fff;
        background:radial-gradient(circle at 88% 8%,rgba(255,211,30,.4),transparent 45%),linear-gradient(150deg,#ff5ba8,#7a3bd8 58%,#0a42d8);
        border:2px solid rgba(255,211,30,.7);box-shadow:0 24px 70px rgba(0,0,0,.55);
        transform:translateY(18px) scale(.94);transition:transform .3s cubic-bezier(.2,.9,.25,1.2)}
      .byr2x1-pop.is-open .byr2x1-card{transform:translateY(0) scale(1)}
      .byr2x1-close{position:absolute;top:12px;right:14px;width:38px;height:38px;border:0;border-radius:50%;
        background:rgba(255,255,255,.16);color:#fff;font-size:1.6rem;line-height:1;cursor:pointer}
      .byr2x1-close:hover{background:rgba(255,255,255,.28)}
      .byr2x1-emoji{font-size:3.4rem;line-height:1;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
      .byr2x1-card h2{margin:12px 0 0;font-family:"Lilita One",sans-serif;font-size:2.1rem;line-height:1;text-transform:uppercase;text-shadow:0 3px 0 rgba(0,0,0,.28)}
      .byr2x1-card p{margin:12px auto 22px;max-width:340px;font-weight:800;color:#ffe9f5;line-height:1.4}
      .byr2x1-actions{display:flex;flex-direction:column;gap:11px}
      .byr2x1-primary{padding:15px 20px;border:0;border-radius:15px;background:#ffd51f;color:#071342;
        font-family:"Lilita One",sans-serif;font-size:1.2rem;text-transform:uppercase;cursor:pointer;box-shadow:0 6px 0 #a87800;transition:transform .15s,box-shadow .15s}
      .byr2x1-primary:hover{transform:translateY(-2px);box-shadow:0 8px 0 #a87800}
      .byr2x1-primary:active{transform:translateY(2px);box-shadow:0 3px 0 #a87800}
      .byr2x1-primary:disabled{opacity:.7;cursor:default}
      .byr2x1-secondary{padding:11px;border:0;background:transparent;color:#ffe1f0;font-weight:800;cursor:pointer;text-decoration:underline}
      .byr2x1-codebox{display:flex;align-items:stretch;gap:9px;margin:0 0 4px}
      .byr2x1-codebox strong{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px 8px;border-radius:13px;
        background:#02092d;border:2px dashed rgba(255,211,30,.6);
        font-family:"Courier New",monospace;font-size:1.5rem;font-weight:700;letter-spacing:.12em;color:#ffd94a;overflow-x:auto;user-select:all}
      .byr2x1-copy{flex-shrink:0;padding:0 16px;border:0;border-radius:13px;background:#ffd51f;color:#071342;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #a87800;transition:transform .15s}
      .byr2x1-copy:hover{transform:translateY(-2px)}
      .byr2x1-copy.copied{background:#53e87d;box-shadow:0 4px 0 #1c8a44;color:#06251a}
      @media(prefers-reduced-motion:reduce){.byr2x1-pop,.byr2x1-card{transition:none}}
    `;
    document.head.appendChild(style);
  }

  /* --- Construcción del modal --- */

  let overlay = null;

  function close() {
    markDismissed();
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

  function renderCodeView(card, code) {
    const p = card.querySelector(".byr2x1-copy-target");
    if (p) {
      p.textContent = "Mostrá este código en el local. Ya quedó guardado en Mis cupones.";
    }
    const actions = card.querySelector(".byr2x1-actions");
    actions.innerHTML = "";

    const box = document.createElement("div");
    box.className = "byr2x1-codebox";
    const strong = document.createElement("strong");
    strong.textContent = code;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "byr2x1-copy";
    copy.textContent = "Copiar";
    copy.addEventListener("click", () => copyCode(code, copy));
    box.append(strong, copy);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "byr2x1-secondary";
    closeBtn.textContent = "Listo, cerrar";
    closeBtn.addEventListener("click", close);

    actions.append(box, closeBtn);

    // Avisamos al resto de la app (banner del perfil, Mis cupones).
    window.dispatchEvent(new CustomEvent("byr:user-updated"));
  }

  async function activate(primaryBtn, card) {
    primaryBtn.disabled = true;
    primaryBtn.textContent = "Activando…";
    let data;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin"
      });
      data = await res.json();
    } catch (error) {
      data = null;
    }

    if (data && data.code) {
      renderCodeView(card, data.code);
    } else {
      primaryBtn.disabled = false;
      primaryBtn.textContent = "Activar mi 2x1";
    }
  }

  function openModal(claimed, code) {
    injectStyles();

    overlay = document.createElement("div");
    overlay.className = "byr2x1-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "2x1 de socio de los miércoles");

    const card = document.createElement("div");
    card.className = "byr2x1-card";
    card.innerHTML = `
      <button type="button" class="byr2x1-close" aria-label="Cerrar">×</button>
      <span class="byr2x1-emoji" aria-hidden="true">🍔</span>
      <h2>¡Hoy es miércoles!</h2>
      <p class="byr2x1-copy-target">Como socio tenés tu <strong>2x1</strong>: pedí una Doble Cheese con papas y llevate otra igual gratis.</p>
      <div class="byr2x1-actions"></div>
    `;
    overlay.append(card);
    document.body.append(overlay);

    card.querySelector(".byr2x1-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });

    if (claimed && code) {
      renderCodeView(card, code);
    } else {
      const actions = card.querySelector(".byr2x1-actions");
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "byr2x1-primary";
      primary.textContent = "Activar mi 2x1";
      primary.addEventListener("click", () => activate(primary, card));

      const later = document.createElement("button");
      later.type = "button";
      later.className = "byr2x1-secondary";
      later.textContent = "Ahora no";
      later.addEventListener("click", close);

      actions.append(primary, later);
    }

    // Forzamos el reflow antes de animar la entrada.
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

    if (!data || !data.isWednesday) return;
    openModal(Boolean(data.claimed), data.code || null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
