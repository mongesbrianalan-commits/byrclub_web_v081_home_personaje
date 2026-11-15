(() => {
  "use strict";

  /* =========================================================
     BYR Club — Popup "Tené la app en tu celu"
     ---------------------------------------------------------
     Aparece al entrar a la home desde el celular y ofrece dos cosas:
       1) Agregar BYR Club a la pantalla de inicio (si no está instalada).
          - Android/Chrome: botón "Instalar app" (prompt nativo).
          - Android sin prompt: pasos con los 3 puntitos.
          - iPhone: pasos con Compartir → Agregar a inicio (solo Safari).
       2) Activar los avisos (si está logueado y no los tiene activados).
          En iPhone eso solo se puede desde la app instalada.
     Si no queda nada por hacer, no aparece. "Ahora no" lo pausa 3 días.
     Espera a que se cierren los otros popups (2x1, ganador del Prode).
     Necesita push.js cargado antes (window.BYRPush) y push.css.
  ========================================================= */

  const DISMISS_KEY = "byrclub_app_popup_v1";
  const SNOOZE_DAYS = 3;
  const STYLE_ID = "byr-app-popup-styles";
  const OTHER_POPUPS = ".byr2x1-pop, .byrwin-pop";

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  /* En iPhone, "Agregar a inicio" solo está seguro en Safari (no en Instagram, Facebook, Chrome viejo, etc.) */
  const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios|instagram|fban|fbav|line\/|wv\)/i.test(ua);
  const isInApp = /instagram|fban|fbav|line\/|tiktok|; wv\)/i.test(ua);

  if (!isIOS && !isAndroid) return; // solo celulares

  function snoozed() {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function snooze() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    } catch (e) { /* noop */ }
  }

  if (snoozed()) return;

  /* El evento de instalación de Chrome llega en cualquier momento: lo guardamos ya. */
  let installEvent = null;
  let installSection = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    if (installSection) fillInstall(installSection);
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    if (installSection) installDone(installSection);
  });

  /* ---------------- Estilos ---------------- */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .byrapp-pop{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:16px;
        background:rgba(2,6,28,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .28s ease}
      @media(min-height:640px){.byrapp-pop{align-items:center}}
      .byrapp-pop.is-open{opacity:1}
      .byrapp-card{position:relative;width:min(440px,100%);max-height:calc(100vh - 32px);overflow-y:auto;padding:26px 22px 18px;border-radius:26px;color:#fff;
        background:radial-gradient(circle at 90% 0%,rgba(56,217,255,.28),transparent 45%),linear-gradient(160deg,#0e3fbf,#071d6b 60%,#040f45);
        border:2px solid rgba(255,213,31,.55);box-shadow:0 24px 70px rgba(0,0,0,.55);
        transform:translateY(24px) scale(.96);transition:transform .3s cubic-bezier(.2,.9,.25,1.2);font-family:"Baloo 2",sans-serif}
      .byrapp-pop.is-open .byrapp-card{transform:none}
      .byrapp-close{position:absolute;top:10px;right:12px;width:38px;height:38px;border:0;border-radius:50%;
        background:rgba(255,255,255,.14);color:#fff;font-size:1.6rem;line-height:1;cursor:pointer}
      .byrapp-head{display:flex;align-items:center;gap:14px;padding-right:36px}
      .byrapp-head img{width:62px;height:62px;border-radius:16px;flex:none;box-shadow:0 6px 16px rgba(0,0,0,.35)}
      .byrapp-head h2{margin:0;font-family:"Lilita One",sans-serif;font-weight:400;font-size:1.65rem;line-height:1.02;text-transform:uppercase}
      .byrapp-head h2 span{color:#ffd51f}
      .byrapp-head p{margin:4px 0 0;font-weight:700;color:#bcd3ff;line-height:1.25;font-size:.98rem}
      .byrapp-sec{margin-top:16px;padding:16px;border-radius:18px;background:rgba(3,12,55,.6);border:1px solid rgba(255,255,255,.12)}
      .byrapp-sec h3{margin:0 0 8px;display:flex;align-items:center;gap:8px;font-family:"Lilita One",sans-serif;font-weight:400;font-size:1.15rem;color:#ffd51f;letter-spacing:.01em}
      .byrapp-sec h3 b{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#ffd51f;color:#081242;font-size:.95rem;font-weight:400}
      .byrapp-sec > p{margin:0 0 10px;font-weight:700;color:#cfe0ff;line-height:1.35;font-size:.98rem}
      .byrapp-steps{margin:0;padding:0;list-style:none;display:grid;gap:8px}
      .byrapp-steps li{display:flex;align-items:center;gap:10px;font-weight:700;line-height:1.25;color:#fff;font-size:.98rem}
      .byrapp-steps li em{font-style:normal;color:#ffd51f}
      .byrapp-ic{flex:none;width:34px;height:34px;border-radius:9px;background:#fff;display:grid;place-items:center}
      .byrapp-done{margin:0;font-weight:800;color:#7ff0a0}
      .byrapp-link{display:inline-block;padding:12px 18px;border-radius:14px;background:#ffd51f;color:#081242;font-weight:900;text-decoration:none;box-shadow:0 6px 0 #b88900}
      .byrapp-sec .push-box{margin:0;padding:0;border:0;background:none}
      .byrapp-later{display:block;margin:12px auto 0;padding:8px 12px;border:0;background:none;color:#bcd3ff;font-family:inherit;font-weight:800;font-size:.95rem;text-decoration:underline;cursor:pointer}
      @media(prefers-reduced-motion:reduce){.byrapp-pop,.byrapp-card{transition:none}}
    `;
    document.head.appendChild(style);
  }

  /* ---------------- Íconos ---------------- */

  const IC_DOTS = '<svg width="6" height="20" viewBox="0 0 8 24" fill="#333"><circle cx="4" cy="4" r="3"/><circle cx="4" cy="12" r="3"/><circle cx="4" cy="20" r="3"/></svg>';
  const IC_PHONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>';
  const IC_SHARE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16"/><path d="M12 15V2M8 6l4-4 4 4"/></svg>';
  const IC_PLUS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  const IC_SAFARI = '<svg width="22" height="22" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#1e90ff"/><circle cx="24" cy="24" r="18" fill="#e9f4ff"/><path d="M24 24l9-11-11 9z" fill="#ff3b30"/><path d="M24 24l-9 11 11-9z" fill="#c7c7cc"/></svg>';

  function step(icon, html) {
    return `<li><span class="byrapp-ic">${icon}</span><span>${html}</span></li>`;
  }

  /* ---------------- Secciones ---------------- */

  function installDone(sec) {
    sec.innerHTML = '<h3><b>1</b> Agregala a tu inicio</h3><p class="byrapp-done">✅ ¡Listo! Ya tenés BYR Club en tu inicio.</p>';
  }

  function fillInstall(sec) {
    let body = "";
    if (installEvent) {
      body = '<p>Un toque y queda como app, con ícono propio. Gratis y sin ocupar lugar.</p>' +
        '<button type="button" class="push-btn byrapp-install">📲 Instalar app</button>';
    } else if (isIOS && !isIOSSafari) {
      body = '<p>En iPhone se agrega desde <b>Safari</b>:</p><ul class="byrapp-steps">' +
        step(IC_SAFARI, 'Abrí <em>byrclub.com</em> en Safari') +
        step(IC_SHARE, 'Tocá <em>Compartir</em> (cuadradito con flecha)') +
        step(IC_PLUS, 'Elegí <em>“Agregar a inicio”</em>') + '</ul>';
    } else if (isIOS) {
      body = '<ul class="byrapp-steps">' +
        step(IC_SHARE, 'Tocá <em>Compartir</em> (el cuadradito con flecha de abajo)') +
        step(IC_PLUS, 'Bajá y elegí <em>“Agregar a inicio”</em>') +
        step('<img src="/assets/icons/icon-192.png" alt="" width="34" height="34" style="border-radius:9px">', 'Tocá <em>“Agregar”</em> ¡y listo!') + '</ul>';
    } else if (isInApp) {
      body = '<p>Abrí <b>byrclub.com</b> en <b>Chrome</b> (tocá los 3 puntitos → “Abrir en el navegador”) y desde ahí:</p><ul class="byrapp-steps">' +
        step(IC_DOTS, 'Tocá los <em>3 puntitos</em> de arriba') +
        step(IC_PHONE, 'Elegí <em>“Instalar app”</em> o <em>“Agregar a pantalla principal”</em>') + '</ul>';
    } else {
      body = '<ul class="byrapp-steps">' +
        step(IC_DOTS, 'Tocá los <em>3 puntitos</em> de arriba a la derecha') +
        step(IC_PHONE, 'Elegí <em>“Instalar app”</em> o <em>“Agregar a pantalla principal”</em>') + '</ul>';
    }
    sec.innerHTML = '<h3><b>1</b> Agregala a tu inicio</h3>' + body;

    const btn = sec.querySelector(".byrapp-install");
    if (btn) {
      btn.addEventListener("click", async () => {
        if (!installEvent) return;
        const ev = installEvent;
        btn.disabled = true;
        try {
          ev.prompt();
          const choice = await ev.userChoice;
          installEvent = null;
          if (choice && choice.outcome === "accepted") installDone(sec);
          else fillInstall(sec);
        } catch (e) {
          installEvent = null;
          fillInstall(sec);
        }
      });
    }
  }

  function buildPush(sec, info, num) {
    const title = `<h3><b>${num}</b> Activá los avisos</h3>`;
    if (info.state === "ios-install") {
      sec.innerHTML = title + '<p>Enterate primero de promos, sorteos y el estado de tu pedido. En iPhone se activan <b>desde la app</b>: abrí BYR Club desde el ícono nuevo y tocá “Activar avisos”. 🔔</p>';
      return;
    }
    if (info.state === "hidden") {
      sec.innerHTML = title + '<p>Enterate primero de promos, sorteos y el estado de tu pedido. Ingresá a tu cuenta para activarlos.</p>' +
        '<a class="byrapp-link" href="ingresar.html">Ingresar</a>';
      return;
    }
    sec.innerHTML = title + '<p>Enterate primero de promos, sorteos y cuándo sale tu pedido. 🔔</p>';
    const box = document.createElement("div");
    box.className = "push-box";
    sec.append(box);
    window.BYRPush.mount(box);
  }

  /* ---------------- Modal ---------------- */

  let overlay = null;

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    const el = overlay;
    overlay = null;
    window.setTimeout(() => el.remove(), 280);
  }

  function open(needInstall, pushInfo) {
    injectStyles();

    overlay = document.createElement("div");
    overlay.className = "byrapp-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Tené BYR Club en tu celu");

    const card = document.createElement("div");
    card.className = "byrapp-card";
    const sub = needInstall
      ? "Tenela como app en tu inicio y no te pierdas ninguna promo."
      : "Ya tenés la app. Te falta un paso para no perderte nada.";
    card.innerHTML = `
      <button type="button" class="byrapp-close" aria-label="Cerrar">×</button>
      <div class="byrapp-head">
        <img src="/assets/icons/icon-192.png" alt="">
        <div><h2>BYR Club <span>en tu celu</span></h2><p>${sub}</p></div>
      </div>
    `;

    if (needInstall) {
      installSection = document.createElement("div");
      installSection.className = "byrapp-sec";
      fillInstall(installSection);
      card.append(installSection);
    }
    if (pushInfo) {
      const sec = document.createElement("div");
      sec.className = "byrapp-sec";
      buildPush(sec, pushInfo, needInstall ? 2 : 1);
      card.append(sec);
    }

    const later = document.createElement("button");
    later.type = "button";
    later.className = "byrapp-later";
    later.textContent = "Ahora no";
    card.append(later);

    const dismiss = () => { snooze(); close(); };
    later.addEventListener("click", dismiss);
    card.querySelector(".byrapp-close").addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" && overlay) { dismiss(); document.removeEventListener("keydown", onKey); }
    });

    overlay.append(card);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay && overlay.classList.add("is-open"));
  }

  /* No pisar a los otros popups: esperamos a que no haya ninguno abierto. */
  function whenFree(cb, tries) {
    if (!document.querySelector(OTHER_POPUPS)) return cb();
    if ((tries || 0) > 120) return; // ~3 minutos: lo dejamos para la próxima
    window.setTimeout(() => whenFree(cb, (tries || 0) + 1), 1500);
  }

  async function start() {
    let info = { state: "hidden", loggedIn: false, configured: false };
    if (window.BYRPush) {
      try { info = await window.BYRPush.ready; } catch (e) { /* sin avisos */ }
    }

    const needInstall = !isStandalone;
    let pushInfo = null;
    if (info.state === "off" || info.state === "ios-install") pushInfo = info;
    else if (info.state === "hidden" && info.configured && !info.loggedIn) pushInfo = info;

    if (!needInstall && !pushInfo) return;
    whenFree(() => open(needInstall, pushInfo));
  }

  /* Le damos un respiro a la página (y a los otros popups) antes de aparecer. */
  window.setTimeout(start, 2500);
})();
