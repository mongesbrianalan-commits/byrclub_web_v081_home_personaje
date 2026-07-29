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