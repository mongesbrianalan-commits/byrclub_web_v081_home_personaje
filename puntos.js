(() => {
  "use strict";

  const numberFormatter = new Intl.NumberFormat("es-AR");

  function formatNumber(value) {
    return numberFormatter.format(Math.max(0, Math.round(Number(value) || 0)));
  }

  function updateLevelSteps(level) {
    document.querySelectorAll("[data-level-step]").forEach(step => {
      const stepNumber = Number(step.dataset.levelStep) || 0;

      step.classList.toggle("done", level > stepNumber);
      step.classList.toggle("current", level === stepNumber);
    });
  }

  function render() {
    if (!window.BYRUser?.getState) {
      return;
    }

    const state = BYRUser.getState();
    const progression = BYRUser.getProgression();

    const points = Number(state.wallet?.points) || 0;
    const remainingXp = Math.max(
      0,
      Math.round(progression.nextLevelXp - progression.totalXp)
    );

    document.querySelectorAll("[data-puntos-level]").forEach(el => {
      el.textContent = progression.level;
    });

    document.querySelectorAll("[data-puntos-points]").forEach(el => {
      el.textContent = formatNumber(points);
    });

    document.querySelectorAll("[data-puntos-bar]").forEach(el => {
      el.style.width = `${progression.percentage}%`;
    });

    document.querySelectorAll("[data-puntos-remaining]").forEach(el => {
      el.innerHTML = `Te faltan <b>${formatNumber(remainingXp)} XP</b> para llegar al Nivel ${progression.level + 1}.`;
    });

    updateLevelSteps(progression.level);
  }

  window.addEventListener("focus", render);
  window.addEventListener("pageshow", render);
  window.addEventListener("storage", render);
  window.addEventListener("byr:user-updated", render);

  render();
})();
