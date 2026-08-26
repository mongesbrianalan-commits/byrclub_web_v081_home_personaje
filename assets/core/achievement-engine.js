(() => {
  "use strict";

  /* =========================================================
     BYR Club — logros (vista)

     Este módulo ya NO decide ni paga nada.

     Antes llevaba sus propios contadores en localStorage y llamaba
     a BYRUser.addPoints() para acreditar la recompensa. Como el
     navegador era dueño del estado, alcanzaba con tocar esa clave
     de localStorage para desbloquear los 17 logros y cobrarse los
     4.950 puntos sin jugar a nada.

     Ahora quién tiene cada logro y cuánto le falta lo calcula el
     servidor (api/progress/engine.php) a partir de datos suyos: su
     propio historial de acreditaciones, las fechas de última jugada
     y la tabla de vales. Acá solo se dibuja.

     El catálogo (assets/core/achievements.js) sigue viviendo en el
     navegador porque de ahí salen los nombres, los iconos y las
     descripciones. Las recompensas están duplicadas en el catálogo
     del servidor: si cambia una, hay que tocar los dos lados.
     ========================================================= */

  /* Clave de la versión vieja. La borramos una vez para no dejar
     contadores fantasma dando vueltas. */
  const LEGACY_KEY = "byr_achievement_engine_v1";

  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    /* modo privado sin storage: da igual */
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function registry() {
    return window.BYRAchievementRegistry;
  }

  function serverProgress() {
    return window.BYRProgress?.get?.() || { achievements: [], metrics: {} };
  }

  function serverRecord(id) {
    const list = serverProgress().achievements || [];
    return list.find((item) => item.id === id) || null;
  }

  /* Cuándo se desbloqueó sale del estado, que es donde el servidor
     lo dejó anotado. */
  function unlockedAt(id) {
    const state = window.BYRUser?.getState ? window.BYRUser.getState() : null;
    const found = (state?.achievements || []).find(
      (item) => item && item.id === id
    );

    return found?.unlockedAt || null;
  }

  function getAchievementRecord(id) {
    const record = serverRecord(id);

    if (!record) {
      return {
        id,
        progress: 0,
        unlocked: false,
        unlockedAt: null,
        rewardGranted: false,
        rewardGrantedAt: null
      };
    }

    const at = record.unlocked ? unlockedAt(id) : null;

    return {
      id,
      progress: Number(record.progress) || 0,
      unlocked: Boolean(record.unlocked),
      unlockedAt: at,
      /* El servidor acredita en el mismo movimiento en que
         desbloquea: no existe un logro desbloqueado y sin pagar. */
      rewardGranted: Boolean(record.unlocked),
      rewardGrantedAt: at
    };
  }

  function getAchievementStatus(id) {
    const achievement = registry()?.getById?.(id);

    if (!achievement) {
      return null;
    }

    const record = getAchievementRecord(id);

    return {
      ...clone(achievement),
      status: record,
      percentage: Math.min(
        100,
        Math.round(
          (record.progress / Math.max(1, achievement.target)) * 100
        )
      )
    };
  }

  function getAllStatuses() {
    const all = registry()?.getAll?.() || [];
    return all.map((achievement) => getAchievementStatus(achievement.id));
  }

  function getUnlocked() {
    return getAllStatuses().filter((item) => item?.status?.unlocked);
  }

  function getLocked() {
    return getAllStatuses().filter((item) => !item?.status?.unlocked);
  }

  function getMetrics() {
    return clone(serverProgress().metrics || {});
  }

  function getMetricValue(name) {
    return Number(serverProgress().metrics?.[name]) || 0;
  }

  function getState() {
    return {
      metrics: getMetrics(),
      achievements: getAllStatuses(),
      source: "server"
    };
  }

  /* El historial de desbloqueos sale del estado del socio. */
  function getHistory() {
    const state = window.BYRUser?.getState ? window.BYRUser.getState() : null;

    return (state?.achievements || []).map((item) => ({
      type: "achievement-unlocked",
      achievementId: item?.id,
      achievementName: item?.label,
      createdAt: item?.unlockedAt || null
    }));
  }

  /* ---------------------------------------------------------
     Compatibilidad

     Los juegos siguen llamando a track() cuando pasa algo, y
     streak.js sigue llamando a setMetric(). Ya no hace falta que
     reporten nada — el servidor lo deduce solo — pero dejamos los
     métodos para no romper las llamadas y porque son un buen
     momento para volver a pedir el progreso.
  --------------------------------------------------------- */

  function refresh() {
    return window.BYRProgress?.refresh
      ? window.BYRProgress.refresh()
      : Promise.resolve(null);
  }

  const noop = () => false;

  window.BYRAchievementEngine = {
    init: () => true,

    track: () => {
      refresh();
      return true;
    },
    preview: getAchievementStatus,

    setMetric: noop,
    incrementMetric: noop,
    getMetricValue,
    syncUserMetrics: noop,

    evaluate: refresh,
    retryPendingRewards: refresh,

    getState,
    getMetrics,
    getAchievementStatus,
    getAllStatuses,
    getUnlocked,
    getLocked,
    getHistory,

    reset: noop
  };

  /* Cuando llega progreso nuevo, avisamos para que las pantallas
     que muestran logros se redibujen. */
  window.addEventListener("byr:progress", () => {
    window.dispatchEvent(new CustomEvent("byr:achievements-updated"));
  });
})();
