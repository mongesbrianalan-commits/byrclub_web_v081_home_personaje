const rewardTabs = document.querySelectorAll('.reward-tab');
const rewardPanels = document.querySelectorAll('.reward-panel');

function activateRewardTab(name) {
  rewardTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  rewardPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
}

rewardTabs.forEach(tab => tab.addEventListener('click', () => activateRewardTab(tab.dataset.tab)));
document.querySelectorAll('[data-tab-target]').forEach(button => button.addEventListener('click', () => {
  activateRewardTab(button.dataset.tabTarget);
  document.querySelector('.rewards-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

const benefitItems = document.querySelectorAll('.reveal-benefit');
const benefitObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.animate([
      { opacity: 0, transform: 'translateY(28px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    benefitObserver.unobserve(entry.target);
  });
}, { threshold: .12 });
benefitItems.forEach(item => benefitObserver.observe(item));

/* =========================================
   ESTADO REAL DEL USUARIO
========================================= */

const byrNumberFormatter = new Intl.NumberFormat("es-AR");

function formatBenefitPoints(value) {
  return byrNumberFormatter.format(Math.max(0, Math.round(Number(value) || 0)));
}

function getRewardName(card) {
  return card.querySelector("h2, h3")?.textContent?.trim() || card.dataset.reward;
}

function updateRewardLockState({ card, cost, levelReq, points, level, bar, status, caption, action }) {
  const hasEnoughPoints = points >= cost;
  const hasLevel = level >= levelReq;
  const unlocked = hasEnoughPoints && hasLevel;

  const progress = cost > 0 ? Math.min(100, (points / cost) * 100) : 100;

  if (bar) {
    bar.style.setProperty("--progress", `${progress}%`);
  }

  if (status) {
    status.textContent = unlocked
      ? "Disponible"
      : hasEnoughPoints
        ? `Nivel ${levelReq} requerido`
        : `Te faltan ${formatBenefitPoints(cost - points)}`;
  }

  if (caption) {
    caption.textContent = unlocked
      ? caption.dataset.unlockedCaption || "¡Recompensa lista para reclamar!"
      : caption.dataset.lockedCaption || `Ya recorriste el ${progress.toFixed(1)}% del camino.`;
  }

  if (action) {
    action.classList.toggle("redeem-action", unlocked);
    action.classList.toggle("locked-action", !unlocked);
    action.disabled = !unlocked;

    action.textContent = unlocked
      ? action.dataset.unlockedLabel || "¡Canjear ahora!"
      : !hasLevel
        ? `🔒 Nivel ${levelReq}`
        : `🔒 Faltan ${formatBenefitPoints(cost - points)} pts`;
  }

  if (card.classList.contains("premium-reward")) {
    card.classList.toggle("available", unlocked);
  }

  return unlocked;
}

function updateRewardCard(card, points, level) {
  updateRewardLockState({
    card,
    cost: Number(card.dataset.points) || 0,
    levelReq: Number(card.dataset.level) || 1,
    points,
    level,
    bar: card.querySelector("[data-reward-bar]"),
    status: card.querySelector("[data-reward-status]"),
    caption: card.querySelector("[data-reward-caption]"),
    action: card.querySelector("[data-reward-action]")
  });
}

function updateLegendarySection(points, level) {
  const section = document.querySelector(".legendary-section[data-points]");

  if (!section) {
    return;
  }

  updateRewardLockState({
    card: section,
    cost: Number(section.dataset.points) || 0,
    levelReq: Number(section.dataset.level) || 1,
    points,
    level,
    bar: section.querySelector("[data-reward-bar]"),
    status: null,
    caption: section.querySelector("[data-reward-caption]"),
    action: section.querySelector("[data-reward-action]")
  });
}

function findNextReward(points, level) {
  const cards = Array.from(
    document.querySelectorAll(".premium-reward[data-points]")
  );

  const locked = cards
    .map(card => ({
      card,
      cost: Number(card.dataset.points) || 0,
      levelReq: Number(card.dataset.level) || 1
    }))
    .filter(({ cost, levelReq }) => points < cost || level < levelReq)
    .sort((a, b) => a.cost - b.cost);

  return locked[0] || null;
}

function renderBeneficios() {
  if (!window.BYRUser?.getState) {
    return;
  }

  const state = BYRUser.getState();
  const progression = BYRUser.getProgression();

  const points = Number(state.wallet?.points) || 0;
  const level = progression.level;

  document.querySelectorAll("[data-benef-level]").forEach(el => {
    el.textContent = level;
  });

  document.querySelectorAll("[data-benef-points]").forEach(el => {
    el.textContent = formatBenefitPoints(points);
  });

  document.querySelectorAll(".premium-reward[data-points]").forEach(card => {
    updateRewardCard(card, points, level);
  });

  updateLegendarySection(points, level);

  const next = findNextReward(points, level);
  const nextLabel = document.querySelector("[data-benef-next-label]");
  const nextBar = document.querySelector("[data-benef-next-bar]");
  const nextCaption = document.querySelector("[data-benef-next-caption]");

  if (next) {
    const name = getRewardName(next.card);
    const progress = next.cost > 0
      ? Math.min(100, (points / next.cost) * 100)
      : 100;

    if (nextLabel) nextLabel.textContent = `Próximo premio: ${name}`;
    if (nextBar) nextBar.style.setProperty("--progress", `${progress}%`);
    if (nextCaption) {
      nextCaption.textContent = `${formatBenefitPoints(points)} / ${formatBenefitPoints(next.cost)} puntos`;
    }
  } else {
    if (nextLabel) nextLabel.textContent = "¡Desbloqueaste todos los premios!";
    if (nextBar) nextBar.style.setProperty("--progress", "100%");
    if (nextCaption) nextCaption.textContent = `${formatBenefitPoints(points)} puntos disponibles`;
  }
}

function handleRedeem(event) {
  const button = event.currentTarget;
  const card = button.closest("[data-reward]");

  if (!card || button.disabled || !window.BYRUser?.spendPoints) {
    return;
  }

  const cost = Number(card.dataset.points) || 0;
  const name = getRewardName(card);
  const spent = BYRUser.spendPoints(cost, `Canje: ${name}`);

  if (!spent) {
    renderBeneficios();
    return;
  }

  window.dispatchEvent(new CustomEvent("byr:user-updated"));
  renderBeneficios();

  button.textContent = "✓ ¡Canjeado!";
  button.classList.add("redeemed");
  button.disabled = true;

  window.setTimeout(() => {
    button.classList.remove("redeemed");
    renderBeneficios();
  }, 1600);
}

document.querySelectorAll("[data-reward-action]").forEach(button => {
  button.addEventListener("click", handleRedeem);
});

window.addEventListener("focus", renderBeneficios);
window.addEventListener("pageshow", renderBeneficios);
window.addEventListener("storage", renderBeneficios);
window.addEventListener("byr:user-updated", renderBeneficios);

renderBeneficios();
