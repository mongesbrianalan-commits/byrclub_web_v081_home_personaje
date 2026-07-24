(() => {
  const DEFAULT_DURATION = 850;

  const selectors = {
    points: [
      "[data-byr-points]",
      "#userPoints",
      "#pointsValue",
      "#headerPoints"
    ],

    xp: [
      "[data-byr-xp]",
      "#userXp",
      "#xpValue",
      "#headerXp"
    ],

    xpBar: [
      "[data-byr-xp-bar]",
      "#xpBarFill",
      "#xpProgressFill"
    ],

    level: [
      "[data-byr-level]",
      "#userLevel",
      "#levelValue"
    ]
  };

  function findElement(selectorList) {
    for (const selector of selectorList) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-AR").format(
      Math.max(0, Math.round(Number(value) || 0))
    );
  }

  function animateNumber({
    element,
    from,
    to,
    duration = DEFAULT_DURATION,
    formatter = formatNumber,
    onComplete
  }) {
    if (!element) {
      return;
    }

    const startValue = Number(from) || 0;
    const endValue = Number(to) || 0;
    const startTime = performance.now();

    element.classList.add("is-updating");

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easedProgress =
        1 - Math.pow(1 - progress, 3);

      const currentValue =
        startValue +
        (endValue - startValue) * easedProgress;

      element.textContent = formatter(currentValue);

      if (progress < 1) {
        window.requestAnimationFrame(update);
        return;
      }

      element.textContent = formatter(endValue);
      element.classList.remove("is-updating");
      element.classList.add("has-updated");

      window.setTimeout(() => {
        element.classList.remove("has-updated");
      }, 450);

      if (typeof onComplete === "function") {
        onComplete();
      }
    }

    window.requestAnimationFrame(update);
  }

  function getProgressionData(state) {
    const progression =
      state?.progression ||
      state?.profile?.progression ||
      {};

    const xp =
      Number(progression.xp) ||
      Number(state?.xp) ||
      0;

    const level =
      Number(progression.level) ||
      Number(state?.level) ||
      1;

    const xpCurrent =
      Number(progression.currentXp) ||
      Number(progression.xpCurrent) ||
      xp;

    const xpRequired =
      Number(progression.nextLevelXp) ||
      Number(progression.xpRequired) ||
      Number(progression.xpToNextLevel) ||
      100;

    return {
      xp,
      level,
      xpCurrent,
      xpRequired
    };
  }

  function getPointsData(state) {
    return (
      Number(state?.wallet?.points) ||
      Number(state?.points) ||
      0
    );
  }

  function updatePoints({
    from,
    to,
    duration = DEFAULT_DURATION
  }) {
    const element = findElement(selectors.points);

    animateNumber({
      element,
      from,
      to,
      duration
    });

    return element;
  }

  function updateXp({
    from,
    to,
    duration = DEFAULT_DURATION
  }) {
    const element = findElement(selectors.xp);

    animateNumber({
      element,
      from,
      to,
      duration
    });

    return element;
  }

  function updateLevel(level) {
    const element = findElement(selectors.level);

    if (!element) {
      return null;
    }

    element.textContent = level;
    element.classList.add("has-updated");

    window.setTimeout(() => {
      element.classList.remove("has-updated");
    }, 450);

    return element;
  }

  function updateXpBar({
    current,
    required,
    duration = DEFAULT_DURATION
  }) {
    const bar = findElement(selectors.xpBar);

    if (!bar) {
      return null;
    }

    const safeRequired = Math.max(
      Number(required) || 100,
      1
    );

    const percentage = Math.min(
      Math.max((Number(current) || 0) / safeRequired, 0),
      1
    ) * 100;

    bar.style.transitionDuration = `${duration}ms`;
    bar.style.width = `${percentage}%`;
    bar.setAttribute("aria-valuenow", String(Math.round(percentage)));

    return bar;
  }

  function sync(options = {}) {
    if (!window.BYRUser?.getState) {
      return null;
    }

    const state = BYRUser.getState();
    const progression = getProgressionData(state);
    const points = getPointsData(state);

    const pointsElement = findElement(selectors.points);
    const xpElement = findElement(selectors.xp);

    if (pointsElement) {
      pointsElement.textContent = formatNumber(points);
    }

    if (xpElement) {
      xpElement.textContent = formatNumber(progression.xp);
    }

    updateLevel(progression.level);

    updateXpBar({
      current: progression.xpCurrent,
      required: progression.xpRequired,
      duration: options.duration || 0
    });

    return {
      points,
      ...progression
    };
  }

  window.BYRHUD = {
    sync,
    animateNumber,
    updatePoints,
    updateXp,
    updateXpBar,
    updateLevel,
    formatNumber
  };
})();