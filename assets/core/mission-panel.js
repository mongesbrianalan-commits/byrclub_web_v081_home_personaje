(() => {
  "use strict";

  const PANEL_ID = "byr-daily-missions";
  const LIST_ID = "byr-daily-missions-list";

  let initialized = false;
  let eventsBound = false;

  /* =========================================
     DATOS
  ========================================= */

  function getDailyMissions() {
    if (
      !window.BYRMissionEngine
        ?.getDailyMissions
    ) {
      return [];
    }

    try {
      return window.BYRMissionEngine
        .getDailyMissions();
    } catch (error) {
      console.warn(
        "BYR Mission Panel: no se pudieron leer las misiones.",
        error
      );

      return [];
    }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(
      "es-AR"
    ).format(
      Number(value) || 0
    );
  }

  function getCompletedCount(missions) {
    return missions.filter(
      (item) =>
        item?.status?.completed
    ).length;
  }

  function getTotalRewards(missions) {
    return missions.reduce(
      (totals, item) => {
        totals.points +=
          Number(
            item?.mission?.reward?.points
          ) || 0;

        totals.xp +=
          Number(
            item?.mission?.reward?.xp
          ) || 0;

        return totals;
      },
      {
        points: 0,
        xp: 0
      }
    );
  }

  /* =========================================
     CREACIÓN DEL PANEL
  ========================================= */

  function createPanel() {
    const existing =
      document.getElementById(
        PANEL_ID
      );

    if (existing) {
      return existing;
    }

    const panel =
      document.createElement(
        "section"
      );

    panel.id = PANEL_ID;
    panel.className =
      "byr-missions-panel";

    panel.setAttribute(
      "aria-labelledby",
      "byr-daily-missions-title"
    );

    panel.innerHTML = `
      <div
        class="byr-missions-panel__decoration"
        aria-hidden="true"
      ></div>

      <header
        class="byr-missions-panel__header"
      >
        <div
          class="byr-missions-panel__heading"
        >
          <span
            class="byr-missions-panel__eyebrow"
          >
            Desafíos diarios
          </span>

          <h2
            class="byr-missions-panel__title"
            id="byr-daily-missions-title"
          >
            Misiones de hoy
          </h2>

          <p
            class="byr-missions-panel__subtitle"
          >
            Completalas antes de que termine el día.
          </p>
        </div>

        <div
          class="byr-missions-panel__summary"
          aria-label="Progreso diario"
        >
          <strong
            data-byr-missions-completed
          >
            0
          </strong>

          <span>
            de

            <strong
              data-byr-missions-total
            >
              0
            </strong>
          </span>

          <small>
            completadas
          </small>
        </div>
      </header>

      <div
        class="byr-missions-panel__list"
        id="${LIST_ID}"
      ></div>

      <footer
        class="byr-missions-panel__footer"
      >
        <div
          class="byr-missions-panel__daily-rewards"
        >
          <span
            class="byr-missions-panel__footer-label"
          >
            Recompensas disponibles hoy
          </span>

          <div
            class="byr-missions-panel__reward-totals"
          >
            <span>
              🪙

              <strong
                data-byr-missions-points
              >
                0
              </strong>

              puntos
            </span>

            <span>
              ⭐

              <strong
                data-byr-missions-xp
              >
                0
              </strong>

              XP
            </span>
          </div>
        </div>

        <div
          class="byr-missions-panel__complete-message"
          data-byr-missions-complete-message
          hidden
        >
          🎉 ¡Completaste todas las misiones de hoy!
        </div>
      </footer>
    `;

    return panel;
  }

  /* =========================================
     TARJETAS DE MISIÓN
  ========================================= */

  function createMissionCard(item) {
    const mission =
      item?.mission || {};

    const status =
      item?.status || {};

    const target = Math.max(
      1,
      Number(mission.target) || 1
    );

    const progress = Math.min(
      target,
      Math.max(
        0,
        Number(status.progress) || 0
      )
    );

    const percentage = Math.min(
      100,
      Math.max(
        0,
        Number(item?.percentage) || 0
      )
    );

    const card =
      document.createElement(
        "article"
      );

    card.className =
      "byr-mission-card";

    card.dataset.missionId =
      mission.id || "";

    if (status.completed) {
      card.classList.add(
        "is-completed"
      );
    }

    card.innerHTML = `
      <div
        class="byr-mission-card__icon"
        aria-hidden="true"
      >
        ${mission.icon || "🎯"}
      </div>

      <div
        class="byr-mission-card__body"
      >
        <div
          class="byr-mission-card__top"
        >
          <div>
            <strong
              class="byr-mission-card__name"
            >
              ${
                mission.name ||
                "Misión diaria"
              }
            </strong>

            <p
              class="byr-mission-card__description"
            >
              ${
                mission.description ||
                "Completá este desafío."
              }
            </p>
          </div>

          <span
            class="byr-mission-card__status"
          >
            ${
              status.completed
                ? "✓ Completada"
                : `${progress}/${target}`
            }
          </span>
        </div>
                <div
          class="byr-mission-card__progress"
        >
          <div
            class="byr-mission-card__track"
            role="progressbar"
            aria-label="Progreso de ${
              mission.name || "la misión"
            }"
            aria-valuemin="0"
            aria-valuemax="${target}"
            aria-valuenow="${progress}"
          >
            <div
              class="byr-mission-card__fill"
              style="width: ${percentage}%"
            ></div>
          </div>

          <span
            class="byr-mission-card__percentage"
          >
            ${percentage}%
          </span>
        </div>

        <div
          class="byr-mission-card__rewards"
        >
          <span>
            🪙 +${formatNumber(
              mission?.reward?.points
            )}
          </span>

          <span>
            ⭐ +${formatNumber(
              mission?.reward?.xp
            )} XP
          </span>
        </div>
      </div>
    `;

    return card;
  }

  /* =========================================
     RENDER DEL PANEL
  ========================================= */

  function render() {
    const panel =
      document.getElementById(
        PANEL_ID
      );

    if (!panel) {
      return;
    }

    const list =
      panel.querySelector(
        `#${LIST_ID}`
      );

    if (!list) {
      return;
    }

    const missions =
      getDailyMissions();

    list.innerHTML = "";

    if (missions.length === 0) {
      list.innerHTML = `
        <div
          class="byr-missions-panel__empty"
        >
          <span aria-hidden="true">
            🍔
          </span>

          <strong>
            Todavía no hay misiones disponibles.
          </strong>

          <p>
            Volvé a intentarlo en unos minutos.
          </p>
        </div>
      `;

      updatePanelSummary(
        panel,
        []
      );

      return;
    }

    missions.forEach((item) => {
      const card =
        createMissionCard(item);

      list.appendChild(card);
    });

    updatePanelSummary(
      panel,
      missions
    );
  }

  function updatePanelSummary(
    panel,
    missions
  ) {
    const completed =
      getCompletedCount(missions);

    const total =
      missions.length;

    const rewards =
      getTotalRewards(missions);

    const completedElement =
      panel.querySelector(
        "[data-byr-missions-completed]"
      );

    const totalElement =
      panel.querySelector(
        "[data-byr-missions-total]"
      );

    const pointsElement =
      panel.querySelector(
        "[data-byr-missions-points]"
      );

    const xpElement =
      panel.querySelector(
        "[data-byr-missions-xp]"
      );

    const completeMessage =
      panel.querySelector(
        "[data-byr-missions-complete-message]"
      );

    if (completedElement) {
      completedElement.textContent =
        String(completed);
    }

    if (totalElement) {
      totalElement.textContent =
        String(total);
    }

    if (pointsElement) {
      pointsElement.textContent =
        formatNumber(
          rewards.points
        );
    }

    if (xpElement) {
      xpElement.textContent =
        formatNumber(
          rewards.xp
        );
    }

    const allCompleted =
      total > 0 &&
      completed === total;

    if (completeMessage) {
      completeMessage.hidden =
        !allCompleted;
    }

    panel.classList.toggle(
      "is-all-completed",
      allCompleted
    );
  }

  /* =========================================
     ANIMACIÓN DE ACTUALIZACIÓN
  ========================================= */

  function animateMission(
    missionId
  ) {
    if (!missionId) {
      return;
    }

    const escapedMissionId =
      window.CSS?.escape
        ? window.CSS.escape(
            missionId
          )
        : missionId;

    const card =
      document.querySelector(
        `[data-mission-id="${escapedMissionId}"]`
      );

    if (!card) {
      return;
    }

    card.classList.remove(
      "is-updating"
    );

    void card.offsetWidth;

    card.classList.add(
      "is-updating"
    );

    window.setTimeout(() => {
      card.classList.remove(
        "is-updating"
      );
    }, 850);
  }

  function animateMissions(
    missionIds
  ) {
    if (
      !Array.isArray(missionIds)
    ) {
      return;
    }

    missionIds.forEach(
      (missionId, index) => {
        window.setTimeout(() => {
          animateMission(
            missionId
          );
        }, index * 90);
      }
    );
  }

  /* =========================================
     EVENTOS DEL MOTOR
  ========================================= */

  function handleMissionProgress(
    event
  ) {
    const updates =
      Array.isArray(
        event?.detail?.updates
      )
        ? event.detail.updates
        : [];

    const missionIds =
      updates
        .map(
          (update) =>
            update?.missionId
        )
        .filter(Boolean);

    render();

    window.requestAnimationFrame(
      () => {
        animateMissions(
          missionIds
        );
      }
    );
  }

  function handleMissionCompleted(
    event
  ) {
    const missionId =
      event?.detail?.mission?.id;

    render();

    window.requestAnimationFrame(
      () => {
        animateMission(
          missionId
        );
      }
    );
  }
    /* =========================================
     EVENTOS
  ========================================= */

  function bindEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;

    window.addEventListener(
      "byr:mission-progress",
      handleMissionProgress
    );

    window.addEventListener(
      "byr:mission-completed",
      handleMissionCompleted
    );

    window.addEventListener(
      "byr:daily-missions-created",
      render
    );

    window.addEventListener(
      "byr:missions-reset",
      render
    );

    window.addEventListener(
      "focus",
      render
    );

    window.addEventListener(
      "pageshow",
      render
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) {
          render();
        }
      }
    );
  }

  /* =========================================
     MONTAJE
  ========================================= */

  function mount(target) {
    const panel = createPanel();

    if (typeof target === "string") {
      const targetElement =
        document.querySelector(target);

      if (targetElement) {
        targetElement.appendChild(
          panel
        );
      }
    } else if (
      target instanceof Element
    ) {
      target.appendChild(panel);
    }

    render();

    return panel;
  }

  function autoMount() {
    const existing =
      document.getElementById(
        PANEL_ID
      );

    if (existing) {
      render();

      return existing;
    }

    const explicitMount =
      document.querySelector(
        "[data-byr-missions-mount]"
      );

    if (explicitMount) {
      return mount(
        explicitMount
      );
    }

    const main =
      document.querySelector(
        "main"
      );

    if (main) {
      const panel =
        createPanel();

      main.appendChild(panel);

      render();

      return panel;
    }

    return null;
  }

  /* =========================================
     API PÚBLICA
  ========================================= */

  function refresh() {
    render();
  }

  function destroy() {
    const panel =
      document.getElementById(
        PANEL_ID
      );

    if (panel) {
      panel.remove();
    }
  }

  function isMounted() {
    return Boolean(
      document.getElementById(
        PANEL_ID
      )
    );
  }

  function getElement() {
    return document.getElementById(
      PANEL_ID
    );
  }

  function getMissionElement(
    missionId
  ) {
    if (!missionId) {
      return null;
    }

    const escaped =
      window.CSS?.escape
        ? window.CSS.escape(
            missionId
          )
        : missionId;

    return document.querySelector(
      `[data-mission-id="${escaped}"]`
    );
  }

  function scrollIntoView(
    options = {
      behavior: "smooth",
      block: "start"
    }
  ) {
    const panel =
      getElement();

    if (!panel) {
      return;
    }

    panel.scrollIntoView(
      options
    );
  }

  /* =========================================
     OBSERVER
  ========================================= */

  function observeResize() {
    if (
      !(
        "ResizeObserver" in
        window
      )
    ) {
      return;
    }

    const panel =
      getElement();

    if (!panel) {
      return;
    }

    const observer =
      new ResizeObserver(() => {
        render();
      });

    observer.observe(panel);
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();

    autoMount();

    observeResize();

    render();
  }
    window.BYRMissionPanel = {
    init,
    mount,
    render,
    refresh,
    destroy,
    isMounted,
    getElement,
    getMissionElement,
    scrollIntoView
  };

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();