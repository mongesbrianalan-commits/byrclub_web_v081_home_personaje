(() => {
  "use strict";

  const CONTAINER_ID =
    "byr-achievement-notification-container";

  const DEFAULT_DURATION = 5200;

  let initialized = false;
  let activeNotification = null;
  let hideTimer = null;
  let queue = [];

  /* =========================================
     CONTENEDOR
  ========================================= */

  function createContainer() {
    const existing =
      document.getElementById(CONTAINER_ID);

    if (existing) {
      return existing;
    }

    const container =
      document.createElement("div");

    container.id = CONTAINER_ID;
    container.className =
      "byr-achievement-notifications";

    container.setAttribute(
      "aria-live",
      "polite"
    );

    container.setAttribute(
      "aria-atomic",
      "true"
    );

    document.body.appendChild(container);

    return container;
  }

  /* =========================================
     UTILIDADES
  ========================================= */

  function clearHideTimer() {
    if (!hideTimer) {
      return;
    }

    window.clearTimeout(hideTimer);
    hideTimer = null;
  }

  function normalizeReward(reward) {
    return {
      points:
        Math.max(
          0,
          Number(reward?.points) || 0
        ),

      xp:
        Math.max(
          0,
          Number(reward?.xp) || 0
        )
    };
  }

  function createRewardMarkup(reward) {
    const normalized =
      normalizeReward(reward);

    const parts = [];

    if (normalized.points > 0) {
      parts.push(`
        <span class="byr-achievement-toast__reward-item">
          <span aria-hidden="true">🪙</span>
          +${normalized.points} puntos
        </span>
      `);
    }

    if (normalized.xp > 0) {
      parts.push(`
        <span class="byr-achievement-toast__reward-item">
          <span aria-hidden="true">⭐</span>
          +${normalized.xp} XP
        </span>
      `);
    }

    if (parts.length === 0) {
      return "";
    }

    return `
      <div class="byr-achievement-toast__rewards">
        ${parts.join("")}
      </div>
    `;
  }

  /* =========================================
     TARJETA
  ========================================= */

  function createNotificationElement(payload) {
    const achievement =
      payload?.achievement || {};

    const reward =
      payload?.reward || achievement.reward || {};

    const toast =
      document.createElement("article");

    toast.className =
      "byr-achievement-toast";

    toast.setAttribute(
      "role",
      "status"
    );

    toast.innerHTML = `
      <button
        class="byr-achievement-toast__close"
        type="button"
        aria-label="Cerrar notificación"
      >
        ×
      </button>

      <div
        class="byr-achievement-toast__shine"
        aria-hidden="true"
      ></div>

      <div
        class="byr-achievement-toast__icon"
        aria-hidden="true"
      >
        ${achievement.icon || "🏆"}
      </div>

      <div class="byr-achievement-toast__content">
        <span class="byr-achievement-toast__eyebrow">
          ¡Logro desbloqueado!
        </span>

        <strong class="byr-achievement-toast__title">
          ${achievement.name || "Nuevo logro"}
        </strong>

        <p class="byr-achievement-toast__description">
          ${
            achievement.description ||
            "Completaste un nuevo desafío."
          }
        </p>

        ${createRewardMarkup(reward)}
      </div>
    `;

    const closeButton =
      toast.querySelector(
        ".byr-achievement-toast__close"
      );

    closeButton?.addEventListener(
      "click",
      () => {
        hideCurrent();
      }
    );

    return toast;
  }

  /* =========================================
     SONIDO Y EFECTOS
  ========================================= */

  function playAchievementSound() {
    if (window.BYRAudio?.claim) {
      window.BYRAudio.claim();
      return;
    }

    if (window.BYRAudio?.reveal) {
      window.BYRAudio.reveal();
    }
  }

  function playAchievementEffects(payload) {
    const reward =
      payload?.achievement?.reward ||
      payload?.reward ||
      {};

    if (
      window.BYREffects?.points &&
      Number(reward.points) > 0
    ) {
      window.setTimeout(() => {
        window.BYREffects.points(
          Number(reward.points),
          {
            x: window.innerWidth / 2,
            y: 125
          }
        );
      }, 250);
    }

    if (
      window.BYREffects?.xp &&
      Number(reward.xp) > 0
    ) {
      window.setTimeout(() => {
        window.BYREffects.xp(
          Number(reward.xp),
          {
            x: window.innerWidth / 2,
            y: 165
          }
        );
      }, 520);
    }
  }

  /* =========================================
     MOSTRAR Y OCULTAR
  ========================================= */

  function showNext() {
    if (
      activeNotification ||
      queue.length === 0
    ) {
      return;
    }

    const payload = queue.shift();
    const container = createContainer();

    const toast =
      createNotificationElement(payload);

    activeNotification = toast;

    container.appendChild(toast);

    window.requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    playAchievementSound();
    playAchievementEffects(payload);

    const duration =
      Number(payload?.duration) ||
      DEFAULT_DURATION;

    clearHideTimer();

    hideTimer = window.setTimeout(
      hideCurrent,
      Math.max(1800, duration)
    );
  }

  function hideCurrent() {
    clearHideTimer();

    if (!activeNotification) {
      showNext();
      return;
    }

    const toast = activeNotification;

    activeNotification = null;

    toast.classList.remove("is-visible");
    toast.classList.add("is-leaving");

    window.setTimeout(() => {
      toast.remove();
      showNext();
    }, 420);
  }

  function show(payload) {
    if (!payload?.achievement) {
      console.warn(
        "BYR Achievement Notifications: falta el logro."
      );

      return false;
    }

    queue.push(payload);
    showNext();

    return true;
  }

  /* =========================================
     EVENTOS GLOBALES
  ========================================= */

  function bindEvents() {
    window.addEventListener(
      "byr:achievement-unlocked",
      (event) => {
        show(event.detail);
      }
    );
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    createContainer();
    bindEvents();
  }

  window.BYRAchievementNotifications = {
    init,
    show,
    hide: hideCurrent,

    getQueueLength() {
      return queue.length;
    }
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