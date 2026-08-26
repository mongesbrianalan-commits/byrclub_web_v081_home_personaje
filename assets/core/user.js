(() => {
  "use strict";

  /* =========================================================
     BYR Club — estado del socio en el navegador

     OJO: este módulo ya NO otorga nada.

     Hasta esta versión tenía addPoints(), addXp(), spendPoints(),
     claimPrize() y registerDailyVisit(): el navegador se sumaba los
     puntos y api/state.php guardaba lo que le mandaran. Ésa era la
     causa de fondo de que se pudieran acreditar puntos sin jugar a
     nada — bastaba un POST desde la consola — y de que el ranking,
     que se arma leyendo ese mismo estado, fuera forjable.

     Ahora el estado es del servidor. Acá quedó una copia de lectura
     para dibujar la interfaz, y `replaceState()` para ponerse al día
     con lo que el servidor devuelve.

     Quién acredita, ahora:
       api/scratch/play.php      la raspadita
       api/roulette/spin.php     la ruleta
       api/memory/finish.php     el memotest
       api/progress/sync.php     logros, misiones y la racha
       api/perks/redeem.php      el canje de recompensas
       api/admin/award.php       la carga manual del mostrador
     ========================================================= */

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

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  /*
   * Reemplaza el estado completo por el que mandó el servidor.
   * Es la ÚNICA forma de que cambien los puntos, el XP, el inventario
   * o los logros: alguien le preguntó al servidor y esto es lo que
   * contestó. Detecta la subida de nivel para que el HUD la festeje.
   */
  function replaceState(next) {
    if (!next || typeof next !== "object") {
      return false;
    }

    const previousLevel = getProgression().level;

    /* Guardamos y releemos: load() normaliza la forma del estado,
       igual que cuando arranca la página. */
    window.BYRStorage.save(next);
    state = window.BYRStorage.load();

    emitChange("server");

    const newLevel = getProgression().level;

    if (newLevel > previousLevel) {
      window.dispatchEvent(
        new CustomEvent("byr:level-up", {
          detail: { previousLevel, newLevel }
        })
      );
    }

    return true;
  }

  /*
   * El nombre y el avatar sí son del socio: no valen puntos, y
   * api/state.php los acepta (es lo único que acepta del navegador).
   */
  function setName(name) {
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      return false;
    }

    state.profile.name = cleanName;
    window.BYRStorage.save(state);
    emitChange("profile-updated");

    return true;
  }

  function setAvatar(avatar) {
    const cleanAvatar = String(avatar || "").trim();

    if (!cleanAvatar) {
      return false;
    }

    state.profile.avatar = cleanAvatar;
    window.BYRStorage.save(state);
    emitChange("profile-updated");

    return true;
  }

  function reset() {
    state = window.BYRStorage.reset();
    emitChange("reset");
  }

  window.BYRUser = {
    getState,
    getProgression,
    replaceState,
    setName,
    setAvatar,
    reset
  };
})();
