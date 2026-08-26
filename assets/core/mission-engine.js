(() => {
  "use strict";

  /* =========================================================
     BYR Club — misiones diarias (vista)

     Este módulo ya NO decide ni paga nada.

     Antes elegía las misiones del día, llevaba el progreso en
     localStorage y llamaba a BYRUser.addPoints() al completarlas.
     Como el navegador era dueño del estado, se podían marcar las
     tres como completas y cobrarse los puntos sin jugar.

     Ahora el servidor (api/progress/engine.php) elige las misiones
     del día — con la fecha como semilla, las mismas para todos —,
     mide el progreso con datos suyos y acredita. Acá solo se dibuja.

     El catálogo (assets/core/missions.js) sigue en el navegador
     para los nombres, los iconos y las descripciones.
     ========================================================= */

  const LEGACY_KEY = "byr_mission_engine_v1";

  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    /* modo privado sin storage: da igual */
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function registry() {
    return window.BYRMissionRegistry;
  }

  function serverMissions() {
    return window.BYRProgress?.get?.()?.missions || [];
  }

  function buildStatus(record) {
    const mission = registry()?.getById?.(record.id);

    if (!mission) {
      return null;
    }

    const progress = Number(record.progress) || 0;
    const target = Math.max(1, Number(record.target) || mission.target || 1);

    return {
      mission: clone(mission),
      status: {
        id: record.id,
        progress,
        target,
        completed: Boolean(record.completed),
        /* El servidor acredita en el mismo movimiento en que
           completa: no hay misión completa y sin pagar. */
        rewardGranted: Boolean(record.completed)
      },
      percentage: Math.min(100, Math.round((progress / target) * 100))
    };
  }

  /* Las misiones de hoy, en el orden que las manda el servidor. */
  function getDailyMissions() {
    return serverMissions().map(buildStatus).filter(Boolean);
  }

  function getMissionStatus(id) {
    return getDailyMissions().find((item) => item.mission.id === id) || null;
  }

  function getCompletedMissions() {
    return getDailyMissions().filter((item) => item.status.completed);
  }

  function getPendingMissions() {
    return getDailyMissions().filter((item) => !item.status.completed);
  }

  function getState() {
    return {
      date: new Date().toISOString().slice(0, 10),
      missions: getDailyMissions(),
      source: "server"
    };
  }

  /* El historial de misiones vive en el historial de puntos del
     socio, que escribe el servidor. */
  function getHistory() {
    const state = window.BYRUser?.getState ? window.BYRUser.getState() : null;

    return (state?.history || [])
      .filter((entry) => entry && entry.type === "mission")
      .map((entry) => ({
        type: "mission-completed",
        reason: entry.reason,
        points: entry.points,
        xp: entry.xp,
        createdAt: entry.date
      }));
  }

  /* ---------------------------------------------------------
     Compatibilidad: los juegos siguen llamando a track().
  --------------------------------------------------------- */

  function refresh() {
    return window.BYRProgress?.refresh
      ? window.BYRProgress.refresh()
      : Promise.resolve(null);
  }

  const noop = () => false;

  window.BYRMissionEngine = {
    init: () => true,

    track: () => {
      refresh();
      return true;
    },
    registerDailyVisit: refresh,

    getState,
    getDailyMissions,
    getMissionStatus,
    getCompletedMissions,
    getPendingMissions,
    getHistory,

    simulateDay: noop,
    reset: noop
  };

  window.addEventListener("byr:progress", () => {
    window.dispatchEvent(new CustomEvent("byr:missions-updated"));
  });
})();
