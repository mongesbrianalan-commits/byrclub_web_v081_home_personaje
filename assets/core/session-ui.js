(() => {
  "use strict";

  /* =========================================================
     BYR Club — Control de sesión en el header
     ---------------------------------------------------------
     Inyecta en el .site-header un control que cambia según
     el estado de la sesión (BYRAuth):

       - Sin sesión  -> botón "Ingresar" (link a ingresar.html)
       - Con sesión  -> chip con avatar + nombre y un menú
                        desplegable: "Mi perfil" / "Cerrar sesión"

     Se auto-inyecta el CSS para no tener que sumar un <link>
     en cada página. Solo hace falta cargar este script (y
     auth.js antes) en cada HTML.
  ========================================================= */

  if (!window.BYRAuth) {
    console.warn(
      "session-ui: BYRAuth no está disponible. Cargá auth.js antes."
    );
    return;
  }

  const STYLE_ID = "byr-session-ui-styles";

  /* Base de rutas: igual criterio que app-shell.js. */
  function getRoot() {
    const configured = document.body?.dataset?.root?.trim();
    if (!configured) return "./";
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  const root = getRoot();
  const to = (file) => `${root}${file}`;

  function firstName(name) {
    const clean = String(name || "").trim();
    return clean ? clean.split(/\s+/)[0] : "Miembro";
  }

  /* ---------------------------------------------------------
     Estilos
  --------------------------------------------------------- */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .session-cta{order:90;display:flex;align-items:center;position:relative}

      .session-login{
        display:inline-flex;align-items:center;gap:8px;
        background:rgba(255,255,255,.12);color:#fff;font-weight:900;
        border:2px solid rgba(255,255,255,.3);border-radius:999px;
        padding:10px 18px;transition:.2s;white-space:nowrap
      }
      .session-login:hover{transform:translateY(-3px);background:rgba(255,255,255,.2)}
      .session-login .session-login__icon{font-size:1.05em;line-height:1}

      .session-chip{
        display:inline-flex;align-items:center;gap:9px;
        background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.24);
        border-radius:999px;padding:6px 12px 6px 6px;color:#fff;font-weight:900;
        transition:.2s;max-width:190px
      }
      .session-chip:hover{background:rgba(255,255,255,.2)}
      .session-chip__avatar{
        width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;
        font-size:1.15rem;border-radius:50%;background:#0a42d8;
        box-shadow:0 3px 0 #0438a0
      }
      .session-chip__name{
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:96px
      }
      .session-chip__caret{font-size:.7rem;opacity:.8;transition:transform .2s}
      .session-chip[aria-expanded="true"] .session-chip__caret{transform:rotate(180deg)}

      .session-menu{
        position:absolute;top:calc(100% + 10px);right:0;min-width:186px;
        background:#061656;border:1px solid rgba(255,255,255,.16);
        border-radius:16px;padding:8px;box-shadow:0 22px 55px rgba(1,10,55,.5);
        display:flex;flex-direction:column;gap:2px;z-index:60
      }
      .session-menu[hidden]{display:none}
      .session-menu a,.session-menu button{
        display:flex;align-items:center;gap:10px;width:100%;text-align:left;
        background:transparent;border:0;color:#fff;font-weight:800;
        padding:11px 12px;border-radius:11px;transition:.15s;font-size:.98rem
      }
      .session-menu a:hover,.session-menu button:hover{background:rgba(255,255,255,.1)}
      .session-menu .session-menu__logout{color:#ff8fb2}
      .session-menu .session-menu__logout:hover{background:rgba(255,79,143,.16)}
      .session-menu__sep{height:1px;background:rgba(255,255,255,.12);margin:4px 6px}

      @media (max-width:1050px){
        .session-cta{margin-left:auto}
        .menu-toggle{order:95}
        .session-login{padding:9px 15px}
        .session-chip__name{max-width:78px}
      }
      @media (max-width:340px){
        .session-login__label{display:none}
        .session-login{padding:9px 12px}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     Render del control
  --------------------------------------------------------- */

  function render() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    /* Evita duplicados si se vuelve a renderizar. */
    header.querySelector("[data-session-cta]")?.remove();

    const session = window.BYRAuth.getSession();
    const founderCta = header.querySelector(".header-cta");

    const container = document.createElement("div");
    container.className = "session-cta";
    container.setAttribute("data-session-cta", "");

    if (session) {
      /* Con sesión: ocultamos el CTA de "fundador" (ya es miembro). */
      if (founderCta) founderCta.style.display = "none";
      renderLoggedIn(container, session);
    } else {
      if (founderCta) founderCta.style.display = "";
      renderLoggedOut(container);
    }

    header.appendChild(container);
  }

  function renderLoggedOut(container) {
    container.innerHTML = `
      <a class="session-login" href="${to("ingresar.html")}">
        <span class="session-login__icon" aria-hidden="true">👤</span>
        <span class="session-login__label">Ingresar</span>
      </a>
    `;
  }

  function renderLoggedIn(container, session) {
    const avatar = session.avatar || "🍔";
    const name = firstName(session.name);

    container.innerHTML = `
      <button
        type="button"
        class="session-chip"
        data-session-toggle
        aria-haspopup="true"
        aria-expanded="false"
        aria-label="Menú de tu cuenta"
      >
        <span class="session-chip__avatar" aria-hidden="true">${avatar}</span>
        <span class="session-chip__name">${escapeHtml(name)}</span>
        <span class="session-chip__caret" aria-hidden="true">▾</span>
      </button>
      <div class="session-menu" data-session-menu hidden role="menu">
        <a href="${to("perfil.html")}" role="menuitem">
          <span aria-hidden="true">👤</span> Mi perfil
        </a>
        <div class="session-menu__sep" aria-hidden="true"></div>
        <button
          type="button"
          class="session-menu__logout"
          data-session-logout
          role="menuitem"
        >
          <span aria-hidden="true">↩</span> Cerrar sesión
        </button>
      </div>
    `;

    bindMenu(container);
  }

  /* ---------------------------------------------------------
     Interacción del menú
  --------------------------------------------------------- */

  function bindMenu(container) {
    const toggle = container.querySelector("[data-session-toggle]");
    const menu = container.querySelector("[data-session-menu]");
    const logout = container.querySelector("[data-session-logout]");

    function closeMenu() {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    }

    function openMenu() {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onOutsideClick);
      document.addEventListener("keydown", onEscape);
    }

    function onOutsideClick(event) {
      if (!container.contains(event.target)) closeMenu();
    }

    function onEscape(event) {
      if (event.key === "Escape") {
        closeMenu();
        toggle.focus();
      }
    }

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    logout?.addEventListener("click", async () => {
      logout.disabled = true;
      logout.textContent = "Cerrando…";
      try {
        await window.BYRAuth.logout();
      } catch (error) {
        console.warn("session-ui: error al cerrar sesión", error);
      }
      window.location.assign(to("index.html"));
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */

  function init() {
    injectStyles();
    render();

    /* Si en esta página cambia la sesión, re-renderizamos. */
    window.addEventListener("byr:auth-change", render);
    window.addEventListener("byr:user-updated", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
