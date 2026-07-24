(() => {
  const EFFECTS_ROOT_ID = "byr-effects-root";

  function getEffectsRoot() {
    let root = document.getElementById(EFFECTS_ROOT_ID);

    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = EFFECTS_ROOT_ID;
    root.className = "byr-effects-root";
    root.setAttribute("aria-hidden", "true");

    document.body.appendChild(root);

    return root;
  }

  function removeAfter(element, duration = 1200) {
    window.setTimeout(() => {
      element.remove();
    }, duration);
  }

  function floatingText({
    text,
    icon = "",
    type = "default",
    x = window.innerWidth / 2,
    y = window.innerHeight / 2,
    duration = 1200
  }) {
    const root = getEffectsRoot();
    const effect = document.createElement("div");

    effect.className = `byr-floating-text byr-floating-text--${type}`;
    effect.style.left = `${x}px`;
    effect.style.top = `${y}px`;

    effect.innerHTML = `
      ${icon ? `<span class="byr-floating-text__icon">${icon}</span>` : ""}
      <span class="byr-floating-text__label">${text}</span>
    `;

    root.appendChild(effect);

    window.requestAnimationFrame(() => {
      effect.classList.add("is-active");
    });

    removeAfter(effect, duration);

    return effect;
  }

  function points(amount, options = {}) {
    const numericAmount = Number(amount) || 0;

    return floatingText({
      text: `+${numericAmount} puntos`,
      icon: "🪙",
      type: "points",
      ...options
    });
  }

  function xp(amount, options = {}) {
    const numericAmount = Number(amount) || 0;

    return floatingText({
      text: `+${numericAmount} XP`,
      icon: "⭐",
      type: "xp",
      ...options
    });
  }

  function prize(prizeData = {}, options = {}) {
    const root = getEffectsRoot();
    const card = document.createElement("div");

    const title =
      prizeData.label ||
      prizeData.name ||
      prizeData.title ||
      "¡Premio ganado!";

    const icon =
      prizeData.icon ||
      "🎁";

    card.className = "byr-prize-effect";

    card.innerHTML = `
      <div class="byr-prize-effect__glow"></div>

      <div class="byr-prize-effect__card">
        <span class="byr-prize-effect__eyebrow">
          PREMIO DESBLOQUEADO
        </span>

        <span class="byr-prize-effect__icon">
          ${icon}
        </span>

        <strong class="byr-prize-effect__title">
          ${title}
        </strong>
      </div>
    `;

    root.appendChild(card);

    window.requestAnimationFrame(() => {
      card.classList.add("is-active");
    });

    removeAfter(card, options.duration || 2200);

    return card;
  }

  function levelUp(level, options = {}) {
    const root = getEffectsRoot();
    const celebration = document.createElement("div");

    const levelText =
      level !== undefined && level !== null
        ? `NIVEL ${level}`
        : "NUEVO NIVEL";

    celebration.className = "byr-level-up-effect";

    celebration.innerHTML = `
      <div class="byr-level-up-effect__burst"></div>

      <div class="byr-level-up-effect__content">
        <span class="byr-level-up-effect__stars">
          ⭐ ✦ ⭐
        </span>

        <span class="byr-level-up-effect__eyebrow">
          ¡SUBISTE DE NIVEL!
        </span>

        <strong class="byr-level-up-effect__level">
          ${levelText}
        </strong>
      </div>
    `;

    root.appendChild(celebration);

    window.requestAnimationFrame(() => {
      celebration.classList.add("is-active");
    });

    removeAfter(celebration, options.duration || 2600);

    return celebration;
  }

  function clear() {
    const root = document.getElementById(EFFECTS_ROOT_ID);

    if (root) {
      root.replaceChildren();
    }
  }

  window.BYREffects = {
    floatingText,
    points,
    xp,
    prize,
    levelUp,
    clear
  };
})();