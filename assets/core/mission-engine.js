(() => {
  "use strict";

  const STORAGE_KEY = "byr_daily_missions_v1";
  const VERSION = 1;
  const DAILY_MISSION_COUNT = 3;

  let initialized = false;
  let processing = false;

  /* =========================================
     FECHAS
  ========================================= */

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

  /* =========================================
     ESTADO
  ========================================= */

  function createDefaultState(dateKey = getTodayKey()) {
    return {
      version: VERSION,
      date: dateKey,

      selectedMissionIds: [],

      missions: {},

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

        selectedMissionIds:
          Array.isArray(
            parsed?.selectedMissionIds
          )
            ? parsed.selectedMissionIds
            : [],

        missions: {
          ...(parsed?.missions || {})
        },

        history:
          Array.isArray(parsed?.history)
            ? parsed.history
            : []
      };
    } catch (error) {
      console.warn(
        "BYR Mission Engine: no se pudo leer el estado.",
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
        "BYR Mission Engine: no se pudo guardar el estado.",
        error
      );
    }

    return stateToSave;
  }

  let missionState = loadState();

  /* =========================================
     CATÁLOGO
  ========================================= */

  function getRegistry() {
    return window.BYRMissionRegistry || null;
  }

  function getAllMissions() {
    const registry = getRegistry();

    if (!registry?.getAll) {
      console.warn(
        "BYR Mission Engine: missions.js no está cargado."
      );

      return [];
    }

    return registry.getAll();
  }

  function getMissionById(id) {
    return (
      getRegistry()?.getById?.(id) ||
      null
    );
  }

  /* =========================================
     SELECCIÓN DIARIA
  ========================================= */

  function createSeedFromDate(dateKey) {
    return dateKey
      .split("")
      .reduce(
        (accumulator, character) =>
          accumulator +
          character.charCodeAt(0),
        0
      );
  }

  function seededRandom(seed) {
    let value = seed % 2147483647;

    if (value <= 0) {
      value += 2147483646;
    }

    return () => {
      value =
        (value * 16807) %
        2147483647;

      return (
        (value - 1) /
        2147483646
      );
    };
  }

  function shuffleWithSeed(items, dateKey) {
    const random =
      seededRandom(
        createSeedFromDate(dateKey)
      );

    const result = [...items];

    for (
      let index = result.length - 1;
      index > 0;
      index -= 1
    ) {
      const randomIndex =
        Math.floor(
          random() * (index + 1)
        );

      [
        result[index],
        result[randomIndex]
      ] = [
        result[randomIndex],
        result[index]
      ];
    }

    return result;
  }

  function selectDailyMissions(dateKey) {
    const allMissions =
      getAllMissions();

    if (allMissions.length === 0) {
      return [];
    }

    const mandatoryVisit =
      allMissions.find(
        (mission) =>
          mission.id === "daily-visit"
      );

    const remaining =
      allMissions.filter(
        (mission) =>
          mission.id !== "daily-visit"
      );

    const shuffled =
      shuffleWithSeed(
        remaining,
        dateKey
      );

    const selected = [];

    /*
     * Siempre incluimos la misión de visita,
     * porque es accesible para todos.
     */
    if (mandatoryVisit) {
      selected.push(mandatoryVisit);
    }

    /*
     * Intentamos variar dificultad:
     * una fácil, una media y una restante.
     */
    const easy =
      shuffled.find(
        (mission) =>
          mission.difficulty === "easy"
      );

    const medium =
      shuffled.find(
        (mission) =>
          mission.difficulty === "medium"
      );

    if (
      easy &&
      !selected.some(
        (mission) =>
          mission.id === easy.id
      )
    ) {
      selected.push(easy);
    }

    if (
      medium &&
      !selected.some(
        (mission) =>
          mission.id === medium.id
      )
    ) {
      selected.push(medium);
    }

    for (const mission of shuffled) {
      if (
        selected.length >=
        DAILY_MISSION_COUNT
      ) {
        break;
      }

      if (
        selected.some(
          (selectedMission) =>
            selectedMission.id ===
            mission.id
        )
      ) {
        continue;
      }

      selected.push(mission);
    }

    return selected.slice(
      0,
      DAILY_MISSION_COUNT
    );
  }

  /* =========================================
     REGISTROS
  ========================================= */

  function createMissionRecord(mission) {
    return {
      id: mission.id,
      progress: 0,
      completed: false,
      completedAt: null,
      rewardGranted: false,
      rewardGrantedAt: null
    };
  }

  function getMissionRecord(id) {
    const existing =
      missionState.missions[id];

    if (existing) {
      return existing;
    }

    const mission =
      getMissionById(id);

    if (!mission) {
      return null;
    }

    return createMissionRecord(mission);
  }

  /* =========================================
     CAMBIO DE DÍA
  ========================================= */

  function ensureCurrentDay(
    dateKey = getTodayKey()
  ) {
    const needsReset =
      missionState.date !== dateKey;

    const needsSelection =
      missionState.selectedMissionIds
        .length === 0;

    if (!needsReset && !needsSelection) {
      return false;
    }

    if (needsReset) {
      archiveCurrentDay();

      missionState =
        createDefaultState(dateKey);
    }

    const selected =
      selectDailyMissions(dateKey);

    missionState.selectedMissionIds =
      selected.map(
        (mission) => mission.id
      );

    selected.forEach((mission) => {
      missionState.missions[mission.id] =
        createMissionRecord(mission);
    });

    missionState =
      saveState(missionState);

    dispatch(
      "byr:daily-missions-created",
      {
        date: dateKey,
        missions: getDailyMissions()
      }
    );

    return true;
  }

  function archiveCurrentDay() {
    if (
      !missionState.date ||
      missionState
        .selectedMissionIds.length === 0
    ) {
      return;
    }

    const snapshot = {
      date: missionState.date,

      missions:
        missionState
          .selectedMissionIds
          .map((id) => {
            const mission =
              getMissionById(id);

            const record =
              missionState.missions[id];

            return {
              id,
              name:
                mission?.name ||
                id,

              progress:
                record?.progress || 0,

              target:
                mission?.target || 1,

              completed:
                Boolean(
                  record?.completed
                )
            };
          }),

      archivedAt:
        new Date().toISOString()
    };

    missionState.history.unshift(
      snapshot
    );

    missionState.history =
      missionState.history.slice(
        0,
        30
      );
  }

  /* =========================================
     RECOMPENSAS
  ========================================= */

  function grantMissionReward(mission) {
    const points =
      Math.max(
        0,
        Number(
          mission?.reward?.points
        ) || 0
      );

    const xp =
      Math.max(
        0,
        Number(
          mission?.reward?.xp
        ) || 0
      );

    const result = {
      success: true,
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
          `Misión: ${mission.name}`
        );

        result.pointsGranted =
          points;
      }

      if (
        xp > 0 &&
        window.BYRUser?.addXp
      ) {
        window.BYRUser.addXp(
          xp,
          `Misión: ${mission.name}`
        );

        result.xpGranted = xp;
      }
    } catch (error) {
      console.error(
        "BYR Mission Engine: error entregando recompensa.",
        error
      );

      return {
        ...result,
        success: false,
        error
      };
    }

    return result;
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
      new CustomEvent(
        "byr:user-updated"
      )
    );
  }

  /* =========================================
     COMPLETAR MISIÓN
  ========================================= */

  function completeMission(
    mission,
    record
  ) {
    if (
      record.completed &&
      record.rewardGranted
    ) {
      return null;
    }

    const now =
      new Date().toISOString();

    const completedRecord = {
      ...record,
      progress: mission.target,
      completed: true,
      completedAt:
        record.completedAt || now,
      rewardGranted:
        record.rewardGranted,
      rewardGrantedAt:
        record.rewardGrantedAt
    };

    let rewardResult = {
      success: true,
      pointsGranted: 0,
      xpGranted: 0
    };

    if (
      !completedRecord.rewardGranted
    ) {
      rewardResult =
        grantMissionReward(mission);

      if (rewardResult.success) {
        completedRecord.rewardGranted =
          true;

        completedRecord.rewardGrantedAt =
          now;
      }
    }

    missionState.missions[
      mission.id
    ] = completedRecord;

    missionState =
      saveState(missionState);

    const payload = {
      mission: clone(mission),
      record: clone(completedRecord),
      reward: clone(rewardResult)
    };

    dispatch(
      "byr:mission-completed",
      payload
    );

    if (
      completedRecord.rewardGranted
    ) {
      dispatch(
        "byr:mission-rewarded",
        payload
      );

      notifyUserUpdated();
    }

    return payload;
  }

  /* =========================================
     TRACKING
  ========================================= */

  function normalizeEventName(eventName) {
    if (
      typeof eventName !== "string"
    ) {
      return "";
    }

    const normalized =
      eventName
        .trim()
        .toLowerCase();

    const aliases = {
      games: "game",
      partida: "game",
      juego: "game",

      raspadita: "scratch",

      ruleta: "roulette",
      spin: "roulette",

      premio: "prize",
      prizes: "prize",

      logro: "achievement",
      achievements: "achievement",

      visita: "visit",
      club: "visit"
    };

    return (
      aliases[normalized] ||
      normalized
    );
  }

  function track(
    eventName,
    amount = 1
  ) {
    ensureCurrentDay();

    const event =
      normalizeEventName(eventName);

    const numericAmount =
      Number(amount);

    if (
      !event ||
      !Number.isFinite(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      return {
        updated: [],
        completed: []
      };
    }

    if (processing) {
      return {
        updated: [],
        completed: []
      };
    }

    processing = true;

    try {
      const updated = [];
      const completed = [];

      const dailyMissions =
        getDailyMissions();

      dailyMissions.forEach(
        (missionStatus) => {
          const mission =
            missionStatus.mission;

          const record =
            missionStatus.status;

          if (
            record.completed ||
            mission.event !== event
          ) {
            return;
          }

          const previousProgress =
            Number(
              record.progress
            ) || 0;

          const nextProgress =
            Math.min(
              mission.target,
              previousProgress +
                numericAmount
            );

          const updatedRecord = {
            ...record,
            progress: nextProgress
          };

          missionState.missions[
            mission.id
          ] = updatedRecord;

          updated.push({
            missionId: mission.id,
            previousProgress,
            progress: nextProgress,
            target: mission.target
          });

          if (
            nextProgress >=
            mission.target
          ) {
            const result =
              completeMission(
                mission,
                updatedRecord
              );

            if (result) {
              completed.push(result);
            }
          }
        }
      );

      missionState =
        saveState(missionState);

      if (updated.length > 0) {
        dispatch(
          "byr:mission-progress",
          {
            event,
            updates: updated
          }
        );
      }

      return {
        event,
        amount: numericAmount,
        updated,
        completed
      };
    } finally {
      processing = false;
    }
  }

  /* =========================================
     CONSULTAS
  ========================================= */

  function getDailyMissions() {
    ensureCurrentDay();

    return missionState
      .selectedMissionIds
      .map((id) => {
        const mission =
          getMissionById(id);

        const status =
          getMissionRecord(id);

        if (!mission || !status) {
          return null;
        }

        return {
          mission: clone(mission),
          status: clone(status),

          percentage: Math.min(
            100,
            Math.round(
              (
                status.progress /
                Math.max(
                  1,
                  mission.target
                )
              ) * 100
            )
          )
        };
      })
      .filter(Boolean);
  }

  function getMissionStatus(id) {
    ensureCurrentDay();

    if (
      !missionState
        .selectedMissionIds
        .includes(id)
    ) {
      return null;
    }

    return (
      getDailyMissions().find(
        (item) =>
          item.mission.id === id
      ) || null
    );
  }

  function getCompletedMissions() {
    return getDailyMissions()
      .filter(
        (item) =>
          item.status.completed
      );
  }

  function getPendingMissions() {
    return getDailyMissions()
      .filter(
        (item) =>
          !item.status.completed
      );
  }

  function getState() {
    ensureCurrentDay();

    return clone(missionState);
  }

  function getHistory() {
    return clone(
      missionState.history
    );
  }

  /* =========================================
     MISIÓN DE VISITA
  ========================================= */

  function registerDailyVisit() {
    ensureCurrentDay();

    const visitMission =
      getDailyMissions().find(
        (item) =>
          item.mission.event ===
          "visit"
      );

    if (
      !visitMission ||
      visitMission.status.completed
    ) {
      return {
        registered: false
      };
    }

    return {
      registered: true,
      result: track("visit", 1)
    };
  }

  /* =========================================
     RESET DE DESARROLLO
  ========================================= */

  function reset({
    confirm = false
  } = {}) {
    if (!confirm) {
      console.warn(
        "Para reiniciar las misiones usá: BYRMissionEngine.reset({ confirm: true })"
      );

      return false;
    }

    missionState =
      createDefaultState();

    window.localStorage.removeItem(
      STORAGE_KEY
    );

    missionState =
      saveState(missionState);

    ensureCurrentDay();

    dispatch(
      "byr:missions-reset",
      {
        state: clone(missionState)
      }
    );

    return true;
  }

  /* =========================================
     FECHA SIMULADA PARA DESARROLLO
  ========================================= */

  function simulateDay(dateKey) {
    if (
      typeof dateKey !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey
      )
    ) {
      console.warn(
        'Usá una fecha válida: "YYYY-MM-DD".'
      );

      return null;
    }

    ensureCurrentDay(dateKey);

    return getState();
  }

  /* =========================================
     INICIALIZACIÓN
  ========================================= */

  function init() {
    if (initialized) {
      return getState();
    }

    initialized = true;

    ensureCurrentDay();
    registerDailyVisit();

    return getState();
  }

  window.BYRMissionEngine = {
    init,

    track,
    registerDailyVisit,

    getState,
    getDailyMissions,
    getMissionStatus,
    getCompletedMissions,
    getPendingMissions,
    getHistory,

    simulateDay,
    reset
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