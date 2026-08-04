(() => {
  "use strict";

  /*
   * Rellena las tarjetas de "Racha actual" y "Tus puntos" de la pantalla
   * de Juegos con los datos REALES del usuario (antes eran valores de
   * ejemplo fijos). La sección completa se oculta si no hay sesión.
   *
   * Fuentes de datos:
   *   - Racha:  window.BYRStreak  (mismo motor que usa Perfil)
   *   - Puntos: window.BYRUser.getState().wallet.points  (saldo real,
   *             sincronizado con el servidor por state-sync.js)
   */

  const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

  function isLoggedIn() {
    return Boolean(window.BYRAuth?.isLoggedIn?.());
  }

  function formatPoints(value) {
    const safe = Math.max(0, Math.round(Number(value) || 0));
    return safe.toLocaleString("es-AR");
  }

  function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /* =========================================
     RACHA
  ========================================= */

  function renderStreak() {
    const state = window.BYRStreak?.getState
      ? window.BYRStreak.getState()
      : { current: 0, registeredDates: [] };

    const current = Math.max(0, Number(state.current) || 0);

    const valueEl = document.querySelector(
      "[data-juegos-streak-value]"
    );

    if (valueEl) {
      valueEl.textContent =
        current === 1
          ? "1 día seguido"
          : `${current} días seguidos`;
    }

    const hintEl = document.querySelector(
      "[data-juegos-streak-hint]"
    );

    if (hintEl) {
      const visitedToday = window.BYRStreak?.hasVisitedToday
        ? window.BYRStreak.hasVisitedToday()
        : false;

      hintEl.textContent =
        current === 0
          ? "Entrá cada día para empezar tu racha."
          : visitedToday
            ? "Ya sumaste hoy. Volvé mañana para seguir la racha."
            : "Todavía no entraste hoy — no cortes la racha.";
    }

    const weekRow = document.querySelector(
      "[data-juegos-week-row]"
    );

    if (weekRow) {
      const registered = new Set(
        state.registeredDates || []
      );

      const today = new Date();
      const todayIndex = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - todayIndex);

      weekRow.innerHTML = DAY_LABELS
        .map((label, index) => {
          const day = new Date(monday);
          day.setDate(monday.getDate() + index);

          const done = registered.has(getDateKey(day));

          return `<i class="${done ? "done" : ""}">${label}</i>`;
        })
        .join("");
    }
  }

  /* =========================================
     PUNTOS
  ========================================= */

  function renderPoints() {
    const valueEl = document.querySelector(
      "[data-juegos-points]"
    );

    if (!valueEl) {
      return;
    }

    const state = window.BYRUser?.getState
      ? window.BYRUser.getState()
      : null;

    const points = Number(state?.wallet?.points) || 0;

    valueEl.textContent = formatPoints(points);
  }

  /* =========================================
     VISIBILIDAD + RENDER
  ========================================= */

  function render() {
    const section = document.querySelector(
      "[data-juegos-daily-status]"
    );

    if (!section) {
      return;
    }

    /*
     * Sin sesión: ocultamos toda la sección (racha + puntos son datos
     * personales). Usamos display inline porque el CSS define
     * display:grid en .daily-status y el atributo [hidden] no alcanzaría.
     */
    if (!isLoggedIn()) {
      section.style.display = "none";
      return;
    }

    section.style.display = "";

    renderStreak();
    renderPoints();
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    render();

    /*
     * Volvemos a dibujar cuando cambian los puntos, la racha o la sesión
     * (por ejemplo, tras sincronizar con el servidor o iniciar/cerrar sesión).
     */
    window.addEventListener("byr:user-updated", render);
    window.addEventListener("byr:streak-updated", render);
    window.addEventListener("byr:auth-change", render);
  }

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
