(() => {
  "use strict";

  /* =========================================
     CONSTANTES
  ========================================= */

  const SHELL_ID = "byr-app-shell";
  const USER_PANEL_ID = "byr-app-user-panel";

let levelObserver = null;
let globalListenersBound = false;
let previousUserSnapshot = null;
let shellResizeObserver = null;

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
     NAVEGACIÓN
  ========================================= */

  function createFallbackNavigation(rootPath) {
    const header = document.createElement("header");

    header.className = "site-header";

    header.innerHTML = `
      <a
        class="brand"
        href="${rootPath}index.html"
        aria-label="Ir al inicio de BYR Club"
      >
        <img
          src="${rootPath}assets/logo-byr.png"
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

        <a href="${rootPath}dt.html">
          BYR DT
        </a>

        <a href="${rootPath}juegos.html">
          Juegos
        </a>

        <a href="${rootPath}puntos.html">
          Puntos
        </a>

        <a href="${rootPath}ranking.html">
          Ranking
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

      const fileName = href
        .split("/")
        .pop()
        ?.split("?")[0]
        ?.split("#")[0];

      const isCurrentPage =
        Boolean(fileName) &&
        currentPath.endsWith(fileName);

      const isInternalGame =
        currentPath.includes("/games/") &&
        fileName === "juegos.html";

      if (isCurrentPage || isInternalGame) {
        link.classList.add("is-active");
      }
    });
  }

  /* =========================================
     ESTADO DEL USUARIO
  ========================================= */

  function getUserState() {
    if (!window.BYRUser?.getState) {
      return null;
    }

    try {
      return window.BYRUser.getState();
    } catch (error) {
      console.warn(
        "BYR App Shell: no se pudo leer el usuario.",
        error
      );

      return null;
    }
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

  function getUserLevel(state) {
    const computedLevel =
      window.BYRUser?.getProgression?.()?.level;

    if (Number.isFinite(computedLevel) && computedLevel >= 1) {
      return Math.floor(computedLevel);
    }

    const possibleLevel =
      state?.progression?.level ??
      state?.level ??
      state?.user?.level ??
      1;

    const level = Number(possibleLevel);

    if (!Number.isFinite(level) || level < 1) {
      return 1;
    }

    return Math.floor(level);
  }

  function getUserPoints(state) {
  const points =
    state?.wallet?.points ??
    state?.points ??
    state?.user?.points ??
    0;

  const numericPoints = Number(points);

  return Number.isFinite(numericPoints)
    ? numericPoints
    : 0;
}

function getUserXp(state) {
  const xp =
    state?.progression?.xp ??
    state?.xp ??
    state?.user?.xp ??
    0;

  const numericXp = Number(xp);

  return Number.isFinite(numericXp)
    ? numericXp
    : 0;
}

function createUserSnapshot(state) {
  const level = getUserLevel(state);
  const rank = getRankFromLevel(level);

  return {
    points: getUserPoints(state),
    xp: getUserXp(state),
    level,
    rank: rank.name
  };
}

  function getRankFromLevel(level) {
    if (level >= 12) {
      return {
        name: "Leyenda",
        icon: "👑"
      };
    }

    if (level >= 8) {
      return {
        name: "Maestro",
        icon: "🏆"
      };
    }

    if (level >= 5) {
      return {
        name: "Experto",
        icon: "🔥"
      };
    }

    if (level >= 3) {
      return {
        name: "Fan",
        icon: "⭐"
      };
    }

    return {
      name: "Novato",
      icon: "🌱"
    };
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
            <span class="byr-app-user__avatar-icon">
              🍔
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
              Usuario
            </strong>
          </div>
        </a>

        <div
          class="byr-app-user__level"
          data-byr-rank-container
          aria-label="Rango del usuario"
        >
          <span
            class="byr-app-user__rank-icon"
            data-byr-rank-icon
            aria-hidden="true"
          >
            🌱
          </span>

          <span class="byr-app-user__level-label">
            Rango
          </span>

          <strong
            class="byr-app-user__level-value"
            data-byr-rank
          >
            Novato
          </strong>

          <!--
            BYRHUD sigue actualizando este elemento.
            Está oculto porque el HUD visible muestra el rango.
          -->
          <span
            data-byr-level
            hidden
            aria-hidden="true"
          >
            1
          </span>
        </div>

        <div
          class="byr-app-user__points"
          aria-label="Puntos acumulados"
        >
        <span
  class="byr-app-points__gain"
  data-byr-points-gain
  aria-hidden="true"
>
  +0 puntos
</span>
        
        <span
            class="byr-app-user__points-icon"
            aria-hidden="true"
          >
            🪙
          </span>

          <div class="byr-app-user__points-copy">
            <strong
              class="byr-app-user__points-value"
              data-byr-points
            >
              0
            </strong>

            <span class="byr-app-user__points-label">
              puntos
            </span>
          </div>
        </div>

        <div class="byr-app-xp">
        <span
  class="byr-app-xp__gain"
  data-byr-xp-gain
  aria-hidden="true"
>
  +0 XP
</span>
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

      </div>
    `;

    return panel;
  }

  /* =========================================
     SINCRONIZACIÓN DEL USUARIO
  ========================================= */

  function updateUserIdentity(shell, state) {
    const name = getUserName(state);

    const nameElement =
      shell.querySelector("[data-byr-user-name]");

    if (nameElement) {
      nameElement.textContent = name;
    }

    const avatar = state?.profile?.avatar;

    const avatarElement =
      shell.querySelector(".byr-app-user__avatar-icon");

    if (avatarElement && avatar) {
      avatarElement.textContent = avatar;
    }
  }

  function updateRank(shell, suppliedLevel) {
    const state = getUserState();

    const level = Number.isFinite(
      Number(suppliedLevel)
    )
      ? Math.max(1, Math.floor(Number(suppliedLevel)))
      : getUserLevel(state);

    const rank = getRankFromLevel(level);

    const rankElement =
      shell.querySelector("[data-byr-rank]");

    const rankIconElement =
      shell.querySelector("[data-byr-rank-icon]");

    const rankContainer =
      shell.querySelector("[data-byr-rank-container]");

    if (rankElement) {
      rankElement.textContent = rank.name;
    }

    if (rankIconElement) {
      rankIconElement.textContent = rank.icon;
    }

    if (rankContainer) {
      rankContainer.setAttribute(
        "aria-label",
        `Rango ${rank.name}, nivel ${level}`
      );

      rankContainer.dataset.level =
        String(level);

      rankContainer.dataset.rank =
        rank.name.toLowerCase();
    }
  }

  function observeLevelChanges(shell) {
    if (levelObserver) {
      levelObserver.disconnect();
      levelObserver = null;
    }

    const hiddenLevelElement =
      shell.querySelector("[data-byr-level]");

    if (!hiddenLevelElement) {
      return;
    }

    levelObserver = new MutationObserver(() => {
      const level =
        Number(hiddenLevelElement.textContent);

      if (Number.isFinite(level)) {
        updateRank(shell, level);
      }
    });

    levelObserver.observe(
      hiddenLevelElement,
      {
        characterData: true,
        childList: true,
        subtree: true
      }
    );
  }

  function restartAnimation(element, className) {
  if (!element) {
    return;
  }

  element.classList.remove(className);

  /*
   * Fuerza al navegador a reiniciar la animación,
   * incluso si se activa varias veces seguidas.
   */
  void element.offsetWidth;

  element.classList.add(className);
}

function showXpGain(shell, amount) {
  const numericAmount =
    Math.max(0, Number(amount) || 0);

  if (numericAmount <= 0) {
    return;
  }

  const xpContainer =
    shell.querySelector(".byr-app-xp");

  const gainElement =
    shell.querySelector("[data-byr-xp-gain]");

  if (!xpContainer || !gainElement) {
    return;
  }

  gainElement.textContent =
    `+${numericAmount} XP`;

  gainElement.classList.remove(
    "is-visible"
  );

  void gainElement.offsetWidth;

  gainElement.classList.add(
    "is-visible"
  );

  restartAnimation(
    xpContainer,
    "is-xp-gained"
  );

  window.setTimeout(() => {
    gainElement.classList.remove(
      "is-visible"
    );
  }, 1750);
}

function showPointsGain(shell, amount) {
  const numericAmount =
    Math.max(0, Number(amount) || 0);

  if (numericAmount <= 0) {
    return;
  }

  const pointsContainer =
    shell.querySelector(
      ".byr-app-user__points"
    );

  const gainElement =
    shell.querySelector(
      "[data-byr-points-gain]"
    );

  if (!pointsContainer || !gainElement) {
    return;
  }

  gainElement.textContent =
    `+${numericAmount} puntos`;

  gainElement.classList.remove(
    "is-visible"
  );

  void gainElement.offsetWidth;

  gainElement.classList.add(
    "is-visible"
  );

  restartAnimation(
    pointsContainer,
    "is-points-gained"
  );

  window.setTimeout(() => {
    gainElement.classList.remove(
      "is-visible"
    );
  }, 1750);

  flyCoinsToPoints(
    shell,
    numericAmount,
    pointsContainer
  );
}

/* =========================================
   MONEDAS VOLADORAS
========================================= */

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
  );
}

function flyCoinsToPoints(
  shell,
  amount,
  targetElement
) {
  if (
    prefersReducedMotion() ||
    !targetElement?.getBoundingClientRect
  ) {
    return;
  }

  const targetRect =
    targetElement.getBoundingClientRect();

  const targetX =
    targetRect.left + targetRect.width / 2;

  const targetY =
    targetRect.top + targetRect.height / 2;

  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;

  const coinCount = Math.min(
    8,
    Math.max(3, Math.round(amount / 120) + 3)
  );

  for (let index = 0; index < coinCount; index += 1) {
    const coin = document.createElement("span");

    coin.className = "byr-coin-fly";
    coin.textContent = "🪙";
    coin.setAttribute("aria-hidden", "true");

    const jitterX = (Math.random() - 0.5) * 90;
    const jitterY = (Math.random() - 0.5) * 40;

    coin.style.left = `${startX + jitterX}px`;
    coin.style.top = `${startY + jitterY}px`;

    document.body.appendChild(coin);

    const dx = targetX - (startX + jitterX);
    const dy = targetY - (startY + jitterY);

    const arcLift = -110 - Math.random() * 60;

    const animation = coin.animate(
      [
        {
          transform: "translate(0, 0) scale(.6)",
          opacity: 0,
          offset: 0
        },
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 1,
          offset: 0.12
        },
        {
          transform:
            `translate(${dx * 0.55}px, ${dy * 0.4 + arcLift}px) scale(1.05)`,
          opacity: 1,
          offset: 0.55
        },
        {
          transform:
            `translate(${dx}px, ${dy}px) scale(.5)`,
          opacity: 0,
          offset: 1
        }
      ],
      {
        duration: 700 + Math.random() * 220,
        delay: index * 70,
        easing: "cubic-bezier(.3,.7,.4,1)",
        fill: "both"
      }
    );

    animation.onfinish = () => {
      coin.remove();

      if (index === coinCount - 1) {
        restartAnimation(
          targetElement,
          "is-points-gained"
        );
      }
    };
  }
}

function animateUserChanges(
  shell,
  previousSnapshot,
  currentSnapshot
) {
  if (!previousSnapshot) {
    return;
  }

  const pointsElement =
    shell.querySelector(".byr-app-user__points");

  const xpElement =
    shell.querySelector(".byr-app-xp");

  const rankElement =
    shell.querySelector(".byr-app-user__level");

  const avatarElement =
    shell.querySelector(".byr-app-user__avatar");

 if (
  currentSnapshot.points >
  previousSnapshot.points
) {
  const gainedPoints =
    currentSnapshot.points -
    previousSnapshot.points;

  showPointsGain(
    shell,
    gainedPoints
  );

  restartAnimation(
    avatarElement,
    "is-celebrating"
  );
}

  if (
  currentSnapshot.xp >
  previousSnapshot.xp
) {
  const gainedXp =
    currentSnapshot.xp -
    previousSnapshot.xp;

  showXpGain(
    shell,
    gainedXp
  );
}

  const rankChanged =
    currentSnapshot.rank !==
    previousSnapshot.rank;

  const levelIncreased =
    currentSnapshot.level >
    previousSnapshot.level;

  if (rankChanged || levelIncreased) {
    restartAnimation(
      rankElement,
      "is-rank-up"
    );

    restartAnimation(
      avatarElement,
      "is-rank-celebrating"
    );
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
     * Reutilizamos el encabezado que ya existe
     * en la página para conservar su diseño y
     * su navegación móvil.
     */
    const existingHeader =
      document.querySelector(".site-header");

    const navigation =
      existingHeader ||
      createFallbackNavigation(rootPath);

    shell.appendChild(navigation);
    shell.appendChild(
      createUserPanel(rootPath)
    );

    document.body.prepend(shell);

    markActiveNavigation(shell);
    observeLevelChanges(shell);

    return shell;
  }

  /* =========================================
     SINCRONIZACIÓN GENERAL
  ========================================= */

function sync() {
  const shell =
    document.getElementById(SHELL_ID);

  if (!shell) {
    return;
  }

  /*
   * Sin sesión iniciada no mostramos el panel con datos
   * personales (nivel, puntos, XP): el header ya ofrece
   * el botón "Ingresar". Evita que aparezcan datos que
   * quedaron en localStorage de una sesión anterior.
   */
  const loggedIn =
    Boolean(window.BYRAuth?.isLoggedIn?.());

  shell.classList.toggle(
    "byr-app-shell--guest",
    !loggedIn
  );

  if (!loggedIn) {
    updateShellHeightVariable();
    return;
  }

  const state = getUserState();
  const currentSnapshot =
    createUserSnapshot(state);

  updateUserIdentity(shell, state);

  /*
   * Actualiza puntos, XP, nivel y barra.
   */
  if (window.BYRHUD?.sync) {
    window.BYRHUD.sync();
  }

  updateRank(
    shell,
    currentSnapshot.level
  );

  animateUserChanges(
    shell,
    previousUserSnapshot,
    currentSnapshot
  );

  previousUserSnapshot = {
    ...currentSnapshot
  };
}

  function bindGlobalSyncEvents() {
  if (globalListenersBound) {
    return;
  }

  globalListenersBound = true;

  /*
   * Actualiza el HUD cuando el usuario vuelve
   * a esta pestaña o ventana.
   */
  window.addEventListener("focus", () => {
    sync();
  });

  /*
   * Actualiza al volver desde otra página usando
   * los botones Atrás o Adelante del navegador.
   */
  window.addEventListener("pageshow", () => {
    sync();
  });

  /*
   * Cuando la pestaña vuelve a estar visible,
   * comprobamos nuevamente los datos.
   */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      sync();
    }
  });

  /*
   * Permite que cualquier juego o sección
   * avise que cambió el usuario.
   *
   * Ejemplo:
   * window.dispatchEvent(
   *   new CustomEvent("byr:user-updated")
   * );
   */
  window.addEventListener("byr:user-updated", () => {
    sync();
  });

  /*
   * Login / logout: al cambiar la sesión mostramos u
   * ocultamos el panel de usuario.
   */
  window.addEventListener("byr:auth-change", () => {
    sync();
  });

  /*
   * Sincronización entre diferentes pestañas
   * abiertas del mismo navegador.
   */
  window.addEventListener("storage", () => {
    sync();
  });
  
  window.addEventListener(
  "resize",
  updateShellHeightVariable,
  { passive: true }
);
}

function updateShellHeightVariable() {
  const shell =
    document.getElementById(SHELL_ID);

  if (!shell) {
    return;
  }

  const shellHeight =
    Math.ceil(shell.getBoundingClientRect().height);

  document.documentElement.style.setProperty(
    "--byr-app-shell-height",
    `${shellHeight}px`
  );
}

function observeShellSize() {
  const shell =
    document.getElementById(SHELL_ID);

  if (!shell) {
    return;
  }

  if (shellResizeObserver) {
    shellResizeObserver.disconnect();
  }

  if ("ResizeObserver" in window) {
    shellResizeObserver =
      new ResizeObserver(() => {
        updateShellHeightVariable();
      });

    shellResizeObserver.observe(shell);
  }

  updateShellHeightVariable();
}

  /* =========================================
     API PÚBLICA
  ========================================= */

  function setRankFromLevel(level) {
    const shell =
      document.getElementById(SHELL_ID);

    if (!shell) {
      return;
    }

    updateRank(shell, level);
  }

  function refreshNavigation() {
    const shell =
      document.getElementById(SHELL_ID);

    if (!shell) {
      return;
    }

    markActiveNavigation(shell);
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

function init() {
  const shell = createAppShell();

  if (!shell) {
    console.warn(
      "BYR App Shell: no se pudo crear el componente."
    );

    return;
  }

  bindGlobalSyncEvents();
  observeShellSize();
  sync();
}

window.BYRAppShell = {
  init,
  sync,
  refresh: sync,
  createAppShell,
  setRankFromLevel,
  refreshNavigation,
  getRankFromLevel
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