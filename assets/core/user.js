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

  /*
   * Reemplaza el estado completo por el que mandó el servidor.
   * Lo usan los juegos que se resuelven del lado del servidor
   * (el servidor ya sumó los puntos: acá solo nos ponemos al día,
   * sin volver a sumar nada).
   */
  function replaceState(next) {
    if (!next || typeof next !== "object") {
      return false;
    }

    /* Guardamos y releemos: load() normaliza la forma del estado,
       igual que cuando arranca la página. */
    window.BYRStorage.save(next);
    state = window.BYRStorage.load();
    emitChange("server");

    return true;
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

  function claimPrize(prize, source = "Premio") {
  if (!prize || !prize.id) {
    console.error("Premio inválido:", prize);
    return false;
  }

const reward = window.BYRPrizeRegistry?.getPrize(prize.id);

  if (!reward) {
    console.error("Premio no registrado:", prize.id);
    return false;
  }

  const now = new Date().toISOString();

  if (reward.points) {
    state.wallet.points += reward.points;
  }

  if (reward.xp) {
    state.progression.xp += reward.xp;
  }

  if (reward.inventory) {
    state.inventory.unshift({
      ...reward.inventory,
      code: prize.code || null,
      source,
      status: "available",
      obtainedAt: now
    });
  }

  if (reward.achievement) {
    const alreadyUnlocked = state.achievements.some(
      (achievement) => achievement.id === reward.achievement.id
    );

    if (!alreadyUnlocked) {
      state.achievements.unshift({
        ...reward.achievement,
        source,
        unlockedAt: now
      });
    }
  }

  state.history.unshift({
    type: "prize",
    prizeId: prize.id,
    label: prize.label || reward.inventory?.label || reward.achievement?.label,
    points: reward.points || 0,
    xp: reward.xp || 0,
    source,
    date: now
  });

  persist("prize-claimed");
  return true;
}

  function reset() {
    state = window.BYRStorage.reset();
    emitChange("reset");
  }

  registerDailyVisit();

  window.BYRUser = {
  getState,
  replaceState,
  getProgression,
  addXp,
  addPoints,
  spendPoints,
  setName,
  registerDailyVisit,
  claimPrize,
  reset
};
})();