(() => {
  "use strict";

  const STORAGE_KEY = "byr_daily_streak_v1";
  const VERSION = 1;

  let initialized = false;

  /* =========================================
     ESTADO
  ========================================= */

  function createDefaultState() {
    return {
      version: VERSION,
      current: 0,
      best: 0,
      lastVisitDate: null,
      registeredDates: [],
      updatedAt: null
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getTodayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
    if (
      typeof dateKey !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ) {
      return null;
    }

    const [year, month, day] =
      dateKey.split("-").map(Number);

    const parsed = new Date(
      year,
      month - 1,
      day
    );

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  }

  function getDayDifference(
    previousDateKey,
    currentDateKey
  ) {
    const previous =
      parseDateKey(previousDateKey);

    const current =
      parseDateKey(currentDateKey);

    if (!previous || !current) {
      return null;
    }

    const millisecondsPerDay =
      24 * 60 * 60 * 1000;

    const previousUtc = Date.UTC(
      previous.getFullYear(),
      previous.getMonth(),
      previous.getDate()
    );

    const currentUtc = Date.UTC(
      current.getFullYear(),
      current.getMonth(),
      current.getDate()
    );

    return Math.round(
      (currentUtc - previousUtc) /
      millisecondsPerDay
    );
  }

  /* =========================================
     PERSISTENCIA
  ========================================= */

  function loadState() {
    try {
      const saved =
        window.localStorage.getItem(
          STORAGE_KEY
        );

      if (!saved) {
        return createDefaultState();
      }

      const parsed = JSON.parse(saved);
      const defaults = createDefaultState();

      return {
        ...defaults,
        ...parsed,

        current:
          Math.max(
            0,
            Number(parsed?.current) || 0
          ),

        best:
          Math.max(
            0,
            Number(parsed?.best) || 0
          ),

        registeredDates:
          Array.isArray(
            parsed?.registeredDates
          )
            ? parsed.registeredDates
            : []
      };
    } catch (error) {
      console.warn(
        "BYR Streak: no se pudo leer el estado.",
        error
      );

      return createDefaultState();
    }
  }

  function saveState(state) {
    const stateToSave = {
      ...state,
      version: VERSION,
      updatedAt: new Date().toISOString()
    };

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(stateToSave)
      );
    } catch (error) {
      console.warn(
        "BYR Streak: no se pudo guardar el estado.",
        error
      );
    }

    return stateToSave;
  }

  let streakState = loadState();

  /* =========================================
     EVENTOS
  ========================================= */

  function dispatch(name, detail) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: clone(detail)
      })
    );
  }

  function notifyUserUpdated() {
    window.dispatchEvent(
      new CustomEvent("byr:user-updated")
    );
  }

  /* =========================================
     REGISTRO DIARIO
  ========================================= */

  function registerVisit(
    date = new Date(),
    {
      trackAchievements = true
    } = {}
  ) {
    const today = getTodayKey(date);
    const previousState = clone(streakState);

    /*
     * Ya se registró la visita de hoy.
     * No vuelve a sumar.
     */
    if (
      streakState.lastVisitDate === today
    ) {
      return {
        registered: false,
        reason: "already-registered",
        state: clone(streakState)
      };
    }

    const difference =
      streakState.lastVisitDate
        ? getDayDifference(
            streakState.lastVisitDate,
            today
          )
        : null;

    if (
      streakState.lastVisitDate === null
    ) {
      streakState.current = 1;
    } else if (difference === 1) {
      streakState.current += 1;
    } else if (difference > 1) {
      streakState.current = 1;
    } else if (difference === 0) {
      return {
        registered: false,
        reason: "already-registered",
        state: clone(streakState)
      };
    } else {
      /*
       * Evita que una fecha anterior altere
       * accidentalmente la racha real.
       */
      return {
        registered: false,
        reason: "invalid-date-order",
        state: clone(streakState)
      };
    }

    streakState.best = Math.max(
      streakState.best,
      streakState.current
    );

    streakState.lastVisitDate = today;

    if (
      !streakState.registeredDates.includes(
        today
      )
    ) {
      streakState.registeredDates.push(today);
    }

    streakState.registeredDates =
      streakState.registeredDates.slice(-90);

    streakState = saveState(streakState);

    if (
      trackAchievements &&
      window.BYRAchievementEngine?.setMetric
    ) {
      window.BYRAchievementEngine.setMetric(
        "streak",
        streakState.current
      );
    }

    const payload = {
      previous: previousState,
      current: clone(streakState),
      increased:
        streakState.current >
        previousState.current,
      restarted:
        previousState.current > 0 &&
        streakState.current === 1,
      date: today
    };

    dispatch(
      "byr:streak-updated",
      payload
    );

    if (payload.increased) {
      dispatch(
        "byr:streak-increased",
        payload
      );
    }

    if (payload.restarted) {
      dispatch(
        "byr:streak-restarted",
        payload
      );
    }

    notifyUserUpdated();

    return {
      registered: true,
      ...payload
    };
  }

  /* =========================================
     CONSULTAS

     La racha la lleva el SERVIDOR desde que es dueño del estado
     (progression.streak / progression.lastVisit, que marca
     api/progress/sync.php al abrir cualquier página del club).
     Antes la subía este módulo en localStorage, y de ahí salían
     los logros de 3 y 7 días seguidos: se podía inflar a mano.

     El calendario de días visitados (`registeredDates`) sigue
     siendo local. Es decoración del perfil, no vale puntos.
  ========================================= */

  /* La racha del servidor. Si todavía no llegó, caemos a la copia
     local para no mostrar un 0 que parpadea. */
  function serverProgression() {
    const state = window.BYRUser?.getState ? window.BYRUser.getState() : null;
    return state?.progression || null;
  }

  function getState() {
    const progression = serverProgression();
    const local = clone(streakState);

    if (!progression) {
      return local;
    }

    return {
      ...local,
      current: Number(progression.streak) || 0,
      best: Math.max(Number(progression.streak) || 0, local.best || 0),
      lastVisitDate: progression.lastVisit || local.lastVisitDate
    };
  }

  function getCurrent() {
    const progression = serverProgression();

    return progression
      ? Number(progression.streak) || 0
      : streakState.current;
  }

  function getBest() {
    return Math.max(getCurrent(), streakState.best || 0);
  }

  function hasVisitedToday() {
    const progression = serverProgression();
    const today = getTodayKey();

    return progression
      ? progression.lastVisit === today
      : streakState.lastVisitDate === today;
  }

  function getDaysUntilBreak() {
    if (!streakState.lastVisitDate) {
      return 0;
    }

    const difference =
      getDayDifference(
        streakState.lastVisitDate,
        getTodayKey()
      );

    if (difference === 0) {
      return 1;
    }

    if (difference === 1) {
      return 0;
    }

    return 0;
  }

  /* =========================================
     SINCRONIZACIÓN CON LOGROS
  ========================================= */

  function syncAchievements() {
    if (
      !window.BYRAchievementEngine?.setMetric
    ) {
      return false;
    }

    window.BYRAchievementEngine.setMetric(
      "streak",
      streakState.current
    );

    return true;
  }

  /* =========================================
     RESET DE DESARROLLO
  ========================================= */

  function reset({
    confirm = false
  } = {}) {
    if (!confirm) {
      console.warn(
        "Para reiniciar la racha usá: BYRStreak.reset({ confirm: true })"
      );

      return false;
    }

    streakState = createDefaultState();

    window.localStorage.removeItem(
      STORAGE_KEY
    );

    streakState = saveState(streakState);

    dispatch(
      "byr:streak-reset",
      {
        state: clone(streakState)
      }
    );

    return true;
  }

  /* =========================================
     DESARROLLO: SIMULAR FECHAS
  ========================================= */

  function simulateVisit(
    dateKey,
    options = {}
  ) {
    const parsed = parseDateKey(dateKey);

    if (!parsed) {
      console.warn(
        'Usá una fecha válida: "YYYY-MM-DD".'
      );

      return null;
    }

    return registerVisit(
      parsed,
      options
    );
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    if (initialized) {
      return getState();
    }

    initialized = true;

    registerVisit();

    return getState();
  }

  window.BYRStreak = {
    init,
    registerVisit,
    simulateVisit,

    getState,
    getCurrent,
    getBest,
    hasVisitedToday,
    getDaysUntilBreak,

    syncAchievements,
    reset
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
