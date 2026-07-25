(() => {
  "use strict";

  const SHELL_ID = "byr-app-shell";
  const USER_PANEL_ID = "byr-app-user-panel";
  const STYLE_ID = "byr-app-shell-styles";

  /* =========================================
     RUTAS
  ========================================= */

  function getRootPath() {
    const configuredRoot =
      document.body?.dataset?.root?.trim();

    if (!configuredRoot) {
      return "./";
    }

    return configuredRoot.endsWith("/")
      ? configuredRoot
      : `${configuredRoot}/`;
  }

  /* =========================================
     ESTILOS
  ========================================= */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");

    style.id = STYLE_ID;

    style.textContent = `
      /* =====================================
         BYR APP SHELL
      ===================================== */

      #${SHELL_ID} {
        position: sticky;
        top: 0;
        z-index: 9999;

        width: 100%;

        background: #071b5c;

        box-shadow:
          0 12px 30px rgba(0, 0, 0, .28);
      }

      #${SHELL_ID} .site-header {
        position: relative;
        top: auto;
        left: auto;
        right: auto;

        width: 100%;
        z-index: 2;
      }

      /* =====================================
         USER PANEL
      ===================================== */

      #${USER_PANEL_ID} {
        position: relative;

        width: 100%;

        padding: 14px 24px;

        background:
          linear-gradient(
            180deg,
            #123ca4 0%,
            #092a7a 100%
          );

        border-top:
          1px solid rgba(255, 255, 255, .12);

        border-bottom:
          4px solid #ffd12c;

        color: #fff;

        overflow: hidden;
      }

      #${USER_PANEL_ID}::before {
        content: "";

        position: absolute;
        inset: 0;

        background-image:
          radial-gradient(
            rgba(255, 255, 255, .12) 1px,
            transparent 1px
          );

        background-size: 22px 22px;

        opacity: .45;

        pointer-events: none;
      }

      .byr-app-user__inner {
        position: relative;

        max-width: 1280px;

        margin: 0 auto;

        display: grid;

        grid-template-columns:
          minmax(210px, auto)
          minmax(130px, auto)
          minmax(130px, auto)
          minmax(240px, 1fr)
          auto;

        align-items: center;

        gap: 14px;
      }

      /* =====================================
         IDENTIDAD
      ===================================== */

      .byr-app-user__profile {
        display: flex;

        align-items: center;

        gap: 12px;

        min-width: 0;

        color: #fff;

        text-decoration: none;
      }

      .byr-app-user__avatar {
        flex: 0 0 auto;

        width: 52px;
        height: 52px;

        display: grid;

        place-items: center;

        border: 4px solid #fff;

        border-radius: 50%;

        background:
          linear-gradient(
            135deg,
            #ffd72e,
            #ff9d00
          );

        color: #072772;

        font-size: 25px;
        font-weight: 900;

        box-shadow:
          0 6px 0 #d99f00,
          0 10px 18px rgba(0, 0, 0, .25);
      }

      .byr-app-user__identity {
        display: flex;

        flex-direction: column;

        min-width: 0;
      }

      .byr-app-user__greeting {
        font-size: 12px;

        opacity: .78;
      }

      .byr-app-user__name {
        overflow: hidden;

        color: #fff;

        font-size: 21px;
        line-height: 1.05;

        white-space: nowrap;

        text-overflow: ellipsis;
      }

      /* =====================================
         STATS
      ===================================== */

      .byr-app-stat {
        display: flex;

        align-items: center;

        gap: 9px;

        min-height: 54px;

        padding: 9px 13px;

        background: #fff;

        border: 2px solid rgba(6, 36, 111, .12);

        border-radius: 16px;

        box-shadow:
          0 6px 0 rgba(4, 25, 83, .3);
      }

      .byr-app-stat__icon {
        font-size: 24px;
      }

      .byr-app-stat__content {
        display: flex;

        flex-direction: column;
      }

      .byr-app-stat__label {
        color: #66708a;

        font-size: 10px;
        font-weight: 800;

        text-transform: uppercase;
      }

      .byr-app-stat__value {
        color: #0a3aa4;

        font-size: 22px;
        font-weight: 900;
        line-height: 1;
      }

      /* =====================================
         XP
      ===================================== */

      .byr-app-xp {
        min-width: 0;

        padding: 10px 14px;

        background:
          rgba(255, 255, 255, .11);

        border:
          1px solid rgba(255, 255, 255, .16);

        border-radius: 16px;
      }

      .byr-app-xp__top {
        display: flex;

        justify-content: space-between;

        gap: 12px;

        margin-bottom: 7px;

        font-size: 11px;
        font-weight: 800;
      }

      .byr-app-xp__track {
        height: 11px;

        overflow: hidden;

        background:
          rgba(0, 12, 61, .55);

        border:
          2px solid rgba(255, 255, 255, .14);

        border-radius: 999px;
      }

      .byr-app-xp__fill {
        width: 0%;
        height: 100%;

        background:
          linear-gradient(
            90deg,
            #28c7ff 0%,
            #88e6dc 45%,
            #ffd526 100%
          );

        border-radius: inherit;

        transition:
          width .65s cubic-bezier(.2, .8, .2, 1);
      }

      /* =====================================
         BOTÓN
      ===================================== */

      .byr-app-user__button {
        display: inline-flex;

        align-items: center;

        justify-content: center;

        min-height: 48px;

        padding: 11px 17px;

        background:
          linear-gradient(
            180deg,
            #ffe246,
            #ffc617
          );

        border-radius: 15px;

        color: #092b79;

        font-size: 13px;
        font-weight: 900;

        text-align: center;
        text-decoration: none;

        box-shadow:
          0 6px 0 #d49c00;

        transition:
          transform .18s ease,
          box-shadow .18s ease;
      }

      .byr-app-user__button:hover {
        transform: translateY(-2px);

        box-shadow:
          0 8px 0 #d49c00;
      }

      /* =====================================
         TABLET
      ===================================== */

      @media (max-width: 1050px) {
        .byr-app-user__inner {
          grid-template-columns:
            minmax(190px, 1fr)
            minmax(120px, auto)
            minmax(120px, auto)
            minmax(220px, 1fr);
        }

        .byr-app-user__button {
          display: none;
        }
      }

      /* =====================================
         CELULAR
      ===================================== */

      @media (max-width: 700px) {
        #${SHELL_ID} {
          position: sticky;
          top: 0;
        }

        #${USER_PANEL_ID} {
          padding: 9px 12px;

          border-bottom-width: 3px;
        }

        .byr-app-user__inner {
          grid-template-columns:
            minmax(0, 1fr)
            auto
            auto;

          gap: 8px;
        }

        .byr-app-user__profile {
          gap: 8px;
        }

        .byr-app-user__avatar {
          width: 39px;
          height: 39px;

          border-width: 3px;

          font-size: 19px;

          box-shadow:
            0 4px 0 #d99f00;
        }

        .byr-app-user__greeting {
          display: none;
        }

        .byr-app-user__name {
          max-width: 120px;

          font-size: 16px;
        }

        .byr-app-stat {
          min-height: 42px;

          padding: 7px 9px;

          border-radius: 12px;

          box-shadow:
            0 4px 0 rgba(4, 25, 83, .3);
        }

        .byr-app-stat__icon {
          display: none;
        }

        .byr-app-stat__label {
          font-size: 8px;
        }

        .byr-app-stat__value {
          font-size: 17px;
        }

        .byr-app-xp {
          grid-column: 1 / -1;

          padding: 6px 9px;

          border-radius: 11px;
        }

        .byr-app-xp__top {
          margin-bottom: 4px;

          font-size: 9px;
        }

        .byr-app-xp__track {
          height: 8px;
        }

        .byr-app-user__button {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* =========================================
     NAVEGACIÓN
  ========================================= */

  function createFallbackNavigation(rootPath) {
    const header = document.createElement("header");

    header.className = "site-header";

    header.innerHTML = `
      <a
        class="brand"
        href="${rootPath}index.html"
      >
        <img
          src="${rootPath}logo-byr.png"
          alt="BYR Club"
        />
      </a>

      <nav
        class="site-nav"
        aria-label="Navegación principal"
      >
        <a href="${rootPath}index.html">
          Inicio
        </a>

        <a href="${rootPath}beneficios.html">
          Beneficios
        </a>

        <a href="${rootPath}prodes.html">
          Prodes
        </a>

        <a href="${rootPath}juegos.html">
          Juegos
        </a>

        <a href="${rootPath}puntos.html">
          Puntos
        </a>

        <a href="${rootPath}perfil.html">
          Mi perfil
        </a>
      </nav>

      <a
        class="header-button"
        href="${rootPath}perfil.html"
      >
        Ver recompensas
      </a>
    `;

    return header;
  }

  function markActiveNavigation(shell) {
    const currentPath =
      window.location.pathname.toLowerCase();

    const links =
      shell.querySelectorAll(".site-nav a");

    links.forEach((link) => {
      link.classList.remove("is-active");

      const href =
        link.getAttribute("href")?.toLowerCase();

      if (!href) {
        return;
      }

      const fileName = href.split("/").pop();

      const isCurrentPage =
        fileName &&
        currentPath.endsWith(fileName);

      const isGamePage =
        currentPath.includes("/games/") &&
        fileName === "juegos.html";

      if (isCurrentPage || isGamePage) {
        link.classList.add("is-active");
      }
    });
  }

  /* =========================================
     PANEL DEL USUARIO
  ========================================= */

  function createUserPanel(rootPath) {
    const panel = document.createElement("section");

    panel.id = USER_PANEL_ID;
    panel.className = "byr-app-user";

    panel.setAttribute(
      "aria-label",
      "Estado de tu cuenta BYR Club"
    );

    panel.innerHTML = `
      <div class="byr-app-user__inner">

        <a
          class="byr-app-user__profile"
          href="${rootPath}perfil.html"
          aria-label="Ir a mi perfil"
        >
          <div
            class="byr-app-user__avatar"
            aria-hidden="true"
          >
            <span data-byr-avatar-initial>
              B
            </span>
          </div>

          <div class="byr-app-user__identity">
            <span class="byr-app-user__greeting">
              Hola,
            </span>

            <strong
              class="byr-app-user__name"
              data-byr-user-name
            >
              Brian
            </strong>
          </div>
        </a>

        <div class="byr-app-stat">
          <span
            class="byr-app-stat__icon"
            aria-hidden="true"
          >
            🪙
          </span>

          <div class="byr-app-stat__content">
            <span class="byr-app-stat__label">
              Puntos
            </span>

            <strong
              class="byr-app-stat__value"
              data-byr-points
            >
              0
            </strong>
          </div>
        </div>

        <div class="byr-app-stat">
          <span
            class="byr-app-stat__icon"
            aria-hidden="true"
          >
            ⭐
          </span>

          <div class="byr-app-stat__content">
            <span class="byr-app-stat__label">
              Nivel
            </span>

            <strong
              class="byr-app-stat__value"
              data-byr-level
            >
              1
            </strong>
          </div>
        </div>

        <div class="byr-app-xp">
          <div class="byr-app-xp__top">
            <span>
              Experiencia
            </span>

            <strong>
              <span data-byr-xp>0</span>
              XP
            </strong>
          </div>

          <div
            class="byr-app-xp__track"
            role="progressbar"
            aria-label="Progreso de experiencia"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <div
              class="byr-app-xp__fill"
              data-byr-xp-bar
            ></div>
          </div>
        </div>

        <a
          class="byr-app-user__button"
          href="${rootPath}perfil.html"
        >
          Ver mi perfil
        </a>

      </div>
    `;

    return panel;
  }

  /* =========================================
     DATOS DEL USUARIO
  ========================================= */

  function getUserState() {
    if (!window.BYRUser?.getState) {
      return null;
    }

    return window.BYRUser.getState();
  }

  function getUserName(state) {
    return (
      state?.profile?.name ||
      state?.profile?.displayName ||
      state?.user?.name ||
      state?.name ||
      "Usuario"
    );
  }

  function updateUserIdentity(shell) {
    const state = getUserState();
    const name = getUserName(state);

    const nameElement =
      shell.querySelector("[data-byr-user-name]");

    const initialElement =
      shell.querySelector(
        "[data-byr-avatar-initial]"
      );

    if (nameElement) {
      nameElement.textContent = name;
    }

    if (initialElement) {
      initialElement.textContent =
        name.trim().charAt(0).toUpperCase() || "U";
    }
  }

  /* =========================================
     CREACIÓN DEL APP SHELL
  ========================================= */

  function createAppShell() {
    const existingShell =
      document.getElementById(SHELL_ID);

    if (existingShell) {
      return existingShell;
    }

    const rootPath = getRootPath();

    const shell = document.createElement("div");

    shell.id = SHELL_ID;
    shell.className = "byr-app-shell";

    /*
     * Reutilizamos el menú que ya existe
     * para no perder su diseño ni el botón móvil.
     */
    const existingHeader =
      document.querySelector(".site-header");

    const navigation =
      existingHeader ||
      createFallbackNavigation(rootPath);

    shell.appendChild(navigation);
    shell.appendChild(createUserPanel(rootPath));

    document.body.prepend(shell);

    markActiveNavigation(shell);
    updateUserIdentity(shell);

    return shell;
  }

  /* =========================================
     SINCRONIZACIÓN
  ========================================= */

  function sync() {
    const shell =
      document.getElementById(SHELL_ID);

    if (!shell) {
      return;
    }

    updateUserIdentity(shell);

    if (window.BYRHUD?.sync) {
      window.BYRHUD.sync();
    }
  }

  /* =========================================
     INICIO
  ========================================= */

  function init() {
    injectStyles();
    createAppShell();
    sync();
  }

  window.BYRAppShell = {
    init,
    sync,
    createAppShell
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();