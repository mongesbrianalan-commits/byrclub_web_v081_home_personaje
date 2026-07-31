(() => {
  "use strict";

  const STORAGE_KEY = "byr_achievement_engine_v1";
  const VERSION = 1;

  let initialized = false;
  let processing = false;

  /* =========================================
     ESTADO INICIAL
  ========================================= */

  function createDefaultState() {
    return {
      version: VERSION,

      metrics: {
        club: 0,
        games: 0,
        scratch: 0,
        roulette: 0,
        points: 0,
        level: 1,
        streak: 0,
        prizes: 0,
        purchases: 0
      },

      achievements: {},

      history: [],

      updatedAt: new Date().toISOString()
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* =========================================
     PERSISTENCIA
  ========================================= */

  function loadState() {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        return createDefaultState();
      }

      const parsed = JSON.parse(saved);
      const defaults = createDefaultState();

      return {
        ...defaults,
        ...parsed,

        metrics: {
          ...defaults.metrics,
          ...(parsed?.metrics || {})
        },

        achievements: {
          ...(parsed?.achievements || {})
        },

        history: Array.isArray(parsed?.history)
          ? parsed.history
          : []
      };
    } catch (error) {
      console.warn(
        "BYR Achievement Engine: no se pudo leer el estado.",
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
        "BYR Achievement Engine: no se pudo guardar el estado.",
        error
      );
    }

    return stateToSave;
  }

  let engineState = loadState();

  /* =========================================
     DATOS DEL USUARIO
  ========================================= */

  function getUserState() {
    if (!window.BYRUser?.getState) {
      return null;
    }

    try {
      return window.BYRUser.getState();
    } catch (error) {
      console.warn(
        "BYR Achievement Engine: no se pudo leer BYRUser.",
        error
      );

      return null;
    }
  }

  function getUserPoints(userState) {
    const points =
      userState?.wallet?.points ??
      userState?.points ??
      userState?.user?.points ??
      0;

    const numericPoints = Number(points);

    return Number.isFinite(numericPoints)
      ? Math.max(0, numericPoints)
      : 0;
  }

  function getUserLevel(userState) {
    const computedLevel =
      window.BYRUser?.getProgression?.()?.level;

    if (Number.isFinite(computedLevel)) {
      return Math.max(1, Math.floor(computedLevel));
    }

    const level =
      userState?.progression?.level ??
      userState?.level ??
      userState?.user?.level ??
      1;

    const numericLevel = Number(level);

    return Number.isFinite(numericLevel)
      ? Math.max(1, Math.floor(numericLevel))
      : 1;
  }

  function getUserPrizeCount(userState) {
    const possibleCollections = [
      userState?.prizes,
      userState?.inventory?.prizes,
      userState?.rewards,
      userState?.wallet?.prizes
    ];

    const collection = possibleCollections.find(
      Array.isArray
    );

    return collection?.length || 0;
  }

  function syncUserMetrics({ save = true } = {}) {
    const userState = getUserState();

    if (!userState) {
      return clone(engineState.metrics);
    }

    engineState.metrics.points =
      getUserPoints(userState);

    engineState.metrics.level =
      getUserLevel(userState);

    engineState.metrics.prizes =
      Math.max(
        Number(engineState.metrics.prizes) || 0,
        getUserPrizeCount(userState)
      );

    if (save) {
      engineState = saveState(engineState);
    }

    return clone(engineState.metrics);
  }

  /* =========================================
     CATÁLOGO DE LOGROS
  ========================================= */

  function getRegistry() {
    return window.BYRAchievementRegistry || null;
  }

  function getAllAchievements() {
    const registry = getRegistry();

    if (!registry?.getAll) {
      console.warn(
        "BYR Achievement Engine: achievements.js no está cargado."
      );

      return [];
    }

    return registry.getAll();
  }

  function getAchievementRecord(id) {
    const existing =
      engineState.achievements[id];

    if (existing) {
      return existing;
    }

    return {
      id,
      progress: 0,
      unlocked: false,
      unlockedAt: null,
      rewardGranted: false,
      rewardGrantedAt: null
    };
  }

  /* =========================================
     MÉTRICAS
  ========================================= */

  function normalizeMetricName(metric) {
    if (typeof metric !== "string") {
      return "";
    }

    const normalized =
      metric.trim().toLowerCase();

    const aliases = {
      game: "games",
      firstgame: "games",

      scratchgame: "scratch",
      raspadita: "scratch",

      spin: "roulette",
      ruleta: "roulette",

      point: "points",
      puntos: "points",

      rank: "level",
      nivel: "level",

      premio: "prizes",
      prize: "prizes",

      compra: "purchases",
      purchase: "purchases",

      visita: "club",
      visit: "club"
    };

    return aliases[normalized] || normalized;
  }

  function getMetricValue(metric) {
    const normalized =
      normalizeMetricName(metric);

    return Number(
      engineState.metrics[normalized]
    ) || 0;
  }

  function setMetric(
    metric,
    value,
    {
      evaluate = true,
      grantRewards = true
    } = {}
  ) {
    const normalized =
      normalizeMetricName(metric);

    if (!normalized) {
      return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      console.warn(
        `BYR Achievement Engine: valor inválido para "${normalized}".`
      );

      return null;
    }

    engineState.metrics[normalized] =
      Math.max(0, numericValue);

    engineState = saveState(engineState);

    if (evaluate) {
      return evaluateAchievements({
        grantRewards
      });
    }

    return {
      metric: normalized,
      value: engineState.metrics[normalized]
    };
  }

  function incrementMetric(
    metric,
    amount = 1,
    options = {}
  ) {
    const normalized =
      normalizeMetricName(metric);

    const numericAmount = Number(amount);

    if (
      !normalized ||
      !Number.isFinite(numericAmount)
    ) {
      return null;
    }

    const currentValue =
      getMetricValue(normalized);

    return setMetric(
      normalized,
      currentValue + numericAmount,
      options
    );
  }

  /* =========================================
     RECOMPENSAS
  ========================================= */

  function grantReward(achievement) {
    const reward = achievement?.reward || {};

    const points =
      Math.max(0, Number(reward.points) || 0);

    const xp =
      Math.max(0, Number(reward.xp) || 0);

    const result = {
      pointsGranted: 0,
      xpGranted: 0
    };

    try {
      if (
        points > 0 &&
        window.BYRUser?.addPoints
      ) {
        window.BYRUser.addPoints(
          points,
          `Logro: ${achievement.name}`
        );

        result.pointsGranted = points;
      }

      if (
        xp > 0 &&
        window.BYRUser?.addXp
      ) {
        window.BYRUser.addXp(
          xp,
          `Logro: ${achievement.name}`
        );

        result.xpGranted = xp;
      }
    } catch (error) {
      console.error(
        "BYR Achievement Engine: error entregando recompensa.",
        error
      );

      return {
        success: false,
        ...result,
        error
      };
    }

    return {
      success: true,
      ...result
    };
  }

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
     DESBLOQUEO
  ========================================= */

  function unlockAchievement(
    achievement,
    {
      grantRewards = true
    } = {}
  ) {
    const previous =
      getAchievementRecord(achievement.id);

    if (previous.unlocked) {
      return null;
    }

    const now = new Date().toISOString();

    const record = {
      ...previous,
      progress: achievement.target,
      unlocked: true,
      unlockedAt: now,
      rewardGranted: false,
      rewardGrantedAt: null
    };

    let rewardResult = {
      success: true,
      pointsGranted: 0,
      xpGranted: 0
    };

    if (grantRewards) {
      rewardResult = grantReward(achievement);

      if (rewardResult.success) {
        record.rewardGranted = true;
        record.rewardGrantedAt = now;
      }
    }

    engineState.achievements[achievement.id] =
      record;

    engineState.history.unshift({
      type: "achievement-unlocked",
      achievementId: achievement.id,
      achievementName: achievement.name,
      reward: clone(achievement.reward || {}),
      rewardGranted: record.rewardGranted,
      createdAt: now
    });

    engineState.history =
      engineState.history.slice(0, 100);

    engineState = saveState(engineState);

    const payload = {
      achievement: clone(achievement),
      record: clone(record),
      reward: clone(rewardResult)
    };

    dispatch(
      "byr:achievement-unlocked",
      payload
    );

    if (window.BYRMissionEngine?.track) {
  window.BYRMissionEngine.track(
    "achievement"
  );
}

    if (record.rewardGranted) {
      dispatch(
        "byr:achievement-rewarded",
        payload
      );

      notifyUserUpdated();
    }

    return payload;
  }

  /* =========================================
     EVALUACIÓN
  ========================================= */

  function evaluateAchievements({
    grantRewards = true
  } = {}) {
    if (processing) {
      return {
        unlocked: [],
        updated: []
      };
    }

    processing = true;

    try {
      syncUserMetrics({
        save: false
      });

      const achievements =
        getAllAchievements();

      const unlocked = [];
      const updated = [];

      achievements.forEach((achievement) => {
        const metricName =
          normalizeMetricName(
            achievement.category
          );

        const metricValue =
          getMetricValue(metricName);

        const target =
          Math.max(
            1,
            Number(achievement.target) || 1
          );

        const oldRecord =
          getAchievementRecord(
            achievement.id
          );

        const newProgress =
          Math.min(metricValue, target);

        const record = {
          ...oldRecord,
          progress: newProgress
        };

        engineState.achievements[
          achievement.id
        ] = record;

        if (
          newProgress !== oldRecord.progress
        ) {
          updated.push({
            achievementId: achievement.id,
            previousProgress:
              oldRecord.progress,
            progress: newProgress,
            target
          });
        }

        if (
          !oldRecord.unlocked &&
          metricValue >= target
        ) {
          /*
           * Guardamos primero el progreso para
           * que unlockAchievement trabaje con
           * el valor actualizado.
           */
          engineState = saveState(engineState);

          const unlockResult =
            unlockAchievement(
              achievement,
              {
                grantRewards
              }
            );

          if (unlockResult) {
            unlocked.push(unlockResult);
          }
        }
      });

      engineState = saveState(engineState);

      if (updated.length > 0) {
        dispatch(
          "byr:achievement-progress",
          {
            updates: updated
          }
        );
      }

      return {
        unlocked,
        updated,
        metrics: clone(engineState.metrics)
      };
    } finally {
      processing = false;
    }
  }

  /* =========================================
     TRACKING DE EVENTOS
  ========================================= */

  function track(
    eventName,
    amount = 1,
    {
      grantRewards = true
    } = {}
  ) {
    const metric =
      normalizeMetricName(eventName);

    if (!metric) {
      return null;
    }

    /*
     * "games" representa cualquier partida.
     * Al jugar raspadita o ruleta también se
     * incrementa automáticamente.
     */
    if (
      metric === "scratch" ||
      metric === "roulette"
    ) {
      const gameResult = incrementMetric(
        "games",
        amount,
        {
          evaluate: false
        }
      );

      if (!gameResult) {
        return null;
      }
    }

    return incrementMetric(
      metric,
      amount,
      {
        evaluate: true,
        grantRewards
      }
    );
  }

  /* =========================================
     PREVISUALIZACIÓN SIN GUARDAR
  ========================================= */

  function preview(
    eventName,
    amount = 1
  ) {
    const metric =
      normalizeMetricName(eventName);

    if (!metric) {
      return null;
    }

    const simulatedMetrics = {
      ...engineState.metrics
    };

    simulatedMetrics[metric] =
      (Number(simulatedMetrics[metric]) || 0) +
      (Number(amount) || 0);

    if (
      metric === "scratch" ||
      metric === "roulette"
    ) {
      simulatedMetrics.games =
        (Number(simulatedMetrics.games) || 0) +
        (Number(amount) || 0);
    }

    const achievements =
      getAllAchievements();

    const wouldUnlock =
      achievements.filter((achievement) => {
        const record =
          getAchievementRecord(
            achievement.id
          );

        if (record.unlocked) {
          return false;
        }

        const category =
          normalizeMetricName(
            achievement.category
          );

        const simulatedValue =
          Number(simulatedMetrics[category]) || 0;

        return (
          simulatedValue >=
          Number(achievement.target)
        );
      });

    return {
      event: metric,
      amount: Number(amount) || 0,
      simulatedMetrics,
      wouldUnlock
    };
  }

  /* =========================================
     CONSULTAS
  ========================================= */

  function getState() {
    return clone(engineState);
  }

  function getMetrics() {
    return clone(engineState.metrics);
  }

  function getAchievementStatus(id) {
    const achievement =
      getRegistry()?.getById?.(id);

    if (!achievement) {
      return null;
    }

    const record =
      getAchievementRecord(id);

    return {
      ...clone(achievement),
      status: clone(record),
      percentage: Math.min(
        100,
        Math.round(
          (record.progress /
            Math.max(1, achievement.target)) *
            100
        )
      )
    };
  }

  function getAllStatuses() {
    return getAllAchievements().map(
      (achievement) =>
        getAchievementStatus(
          achievement.id
        )
    );
  }

  function getUnlocked() {
    return getAllStatuses().filter(
      (achievement) =>
        achievement?.status?.unlocked
    );
  }

  function getLocked() {
    return getAllStatuses().filter(
      (achievement) =>
        !achievement?.status?.unlocked
    );
  }

  function getHistory() {
    return clone(engineState.history);
  }

  /* =========================================
     REINTENTO DE RECOMPENSAS
  ========================================= */

  function retryPendingRewards() {
    const achievements =
      getAllAchievements();

    const rewarded = [];

    achievements.forEach((achievement) => {
      const record =
        getAchievementRecord(
          achievement.id
        );

      if (
        !record.unlocked ||
        record.rewardGranted
      ) {
        return;
      }

      const rewardResult =
        grantReward(achievement);

      if (!rewardResult.success) {
        return;
      }

      const now = new Date().toISOString();

      engineState.achievements[
        achievement.id
      ] = {
        ...record,
        rewardGranted: true,
        rewardGrantedAt: now
      };

      rewarded.push({
        achievement,
        reward: rewardResult
      });
    });

    if (rewarded.length > 0) {
      engineState = saveState(engineState);

      rewarded.forEach((item) => {
        dispatch(
          "byr:achievement-rewarded",
          item
        );
      });

      notifyUserUpdated();
    }

    return rewarded;
  }

  /* =========================================
     REINICIO SOLO PARA DESARROLLO
  ========================================= */

  function reset({
    confirm = false
  } = {}) {
    if (!confirm) {
      console.warn(
        'Para reiniciar, usá: BYRAchievementEngine.reset({ confirm: true })'
      );

      return false;
    }

    engineState = createDefaultState();

    window.localStorage.removeItem(
      STORAGE_KEY
    );

    engineState = saveState(engineState);

    dispatch(
      "byr:achievements-reset",
      {
        state: clone(engineState)
      }
    );

    return true;
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    if (initialized) {
      return getState();
    }

    initialized = true;

    syncUserMetrics({
      save: false
    });

    /*
     * Entrar a BYR Club cuenta como una visita.
     * Solo se registra una vez en esta versión
     * inicial del motor.
     */
    if (
      getMetricValue("club") < 1
    ) {
      engineState.metrics.club = 1;
    }

    engineState = saveState(engineState);

    evaluateAchievements();
    retryPendingRewards();

    return getState();
  }

  window.BYRAchievementEngine = {
    init,

    track,
    preview,

    setMetric,
    incrementMetric,
    getMetricValue,
    syncUserMetrics,

    evaluate: evaluateAchievements,
    retryPendingRewards,

    getState,
    getMetrics,
    getAchievementStatus,
    getAllStatuses,
    getUnlocked,
    getLocked,
    getHistory,

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