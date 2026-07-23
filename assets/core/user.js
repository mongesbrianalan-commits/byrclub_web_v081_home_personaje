(() => {
  "use strict";

  if (!window.BYRStorage) {
    console.error(
      "BYRStorage no está disponible. Cargá storage.js antes de user.js."
    );
    return;
  }

  let state = window.BYRStorage.load();

  function getLevelFromXp(xp) {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 250)) + 1;
  }

  function getXpRequiredForLevel(level) {
    const safeLevel = Math.max(1, level);
    return Math.pow(safeLevel - 1, 2) * 250;
  }

  function getProgression() {
    const totalXp = state.progression.xp;
    const level = getLevelFromXp(totalXp);
    const currentLevelXp = getXpRequiredForLevel(level);
    const nextLevelXp = getXpRequiredForLevel(level + 1);

    const earnedInsideLevel = totalXp - currentLevelXp;
    const requiredInsideLevel = nextLevelXp - currentLevelXp;

    const percentage = requiredInsideLevel > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (earnedInsideLevel / requiredInsideLevel) * 100
          )
        )
      : 100;

    return {
      level,
      totalXp,
      currentLevelXp,
      nextLevelXp,
      earnedInsideLevel,
      requiredInsideLevel,
      percentage
    };
  }

  function emitChange(reason = "update") {
    window.dispatchEvent(
      new CustomEvent("byr:user-change", {
        detail: {
          reason,
          state: getState(),
          progression: getProgression()
        }
      })
    );
  }

  function persist(reason) {
    window.BYRStorage.save(state);
    emitChange(reason);
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function addXp(amount, reason = "XP ganado") {
    const safeAmount = Number(amount);

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return false;
    }

    const previousLevel = getProgression().level;

    state.progression.xp += Math.round(safeAmount);

    state.history.unshift({
      type: "xp",
      amount: Math.round(safeAmount),
      reason,
      date: new Date().toISOString()
    });

    const newLevel = getProgression().level;

    persist("xp-added");

    if (newLevel > previousLevel) {
      window.dispatchEvent(
        new CustomEvent("byr:level-up", {
          detail: {
            previousLevel,
            newLevel
          }
        })
      );
    }

    return true;
  }

  function addPoints(amount, reason = "Puntos ganados") {
    const safeAmount = Number(amount);

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return false;
    }

    state.wallet.points += Math.round(safeAmount);

    state.history.unshift({
      type: "points",
      amount: Math.round(safeAmount),
      reason,
      date: new Date().toISOString()
    });

    persist("points-added");
    return true;
  }

  function spendPoints(amount, reason = "Canje") {
    const safeAmount = Number(amount);

    if (
      !Number.isFinite(safeAmount) ||
      safeAmount <= 0 ||
      state.wallet.points < safeAmount
    ) {
      return false;
    }

    state.wallet.points -= Math.round(safeAmount);

    state.history.unshift({
      type: "points",
      amount: -Math.round(safeAmount),
      reason,
      date: new Date().toISOString()
    });

    persist("points-spent");
    return true;
  }

  function setName(name) {
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      return false;
    }

    state.profile.name = cleanName;
    persist("profile-updated");
    return true;
  }

  function registerDailyVisit() {
    const today = new Date().toISOString().slice(0, 10);
    const lastVisit = state.progression.lastVisit;

    if (lastVisit === today) {
      return false;
    }

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    if (lastVisit === yesterday) {
      state.progression.streak += 1;
    } else {
      state.progression.streak = 1;
    }

    state.progression.lastVisit = today;

    state.history.unshift({
      type: "visit",
      amount: 1,
      reason: "Visita diaria",
      date: new Date().toISOString()
    });

    persist("daily-visit");
    return true;
  }

  function reset() {
    state = window.BYRStorage.reset();
    emitChange("reset");
  }

  registerDailyVisit();

  window.BYRUser = {
    getState,
    getProgression,
    addXp,
    addPoints,
    spendPoints,
    setName,
    registerDailyVisit,
    reset
  };
})();