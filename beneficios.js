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

/* =========================================================
   SESIÓN — sin login no mostramos datos personales
========================================================= */

function isGuest() {
  /* Si auth.js no cargó todavía, tratamos como invitado:
     preferimos NO filtrar datos personales por accidente. */
  return !window.BYRAuth?.isLoggedIn?.();
}

const LOGIN_URL = "ingresar.html?next=" + encodeURIComponent("beneficios.html");

function renderMotivation({ guest, points = 0, next = null }) {
  const card = document.querySelector("[data-motivation-card]");

  if (!card) {
    return;
  }

  const lead = card.querySelector("[data-motivation-lead]");
  const value = card.querySelector("[data-motivation-value]");
  const tail = card.querySelector("[data-motivation-tail]");
  const note = card.querySelector("[data-motivation-note]");

  card.classList.toggle("is-guest", Boolean(guest));

  if (guest) {
    if (lead) lead.textContent = "Sumá puntos con cada compra";
    if (value) value.textContent = "🍔";
    if (tail) tail.textContent = "y canjealos por comida real";
    if (note) note.textContent = "Iniciá sesión para ver tu progreso.";
    return;
  }

  if (next) {
    const needed = Math.max(0, next.cost - points);
    const name = getRewardName(next.card);

    if (needed > 0) {
      if (lead) lead.textContent = "Te faltan solo";
      if (value) value.textContent = formatBenefitPoints(needed);
      if (tail) tail.textContent = `puntos para ${name}`;
      if (note) note.textContent = "Con una visita más, puede ser tuya.";
    } else {
      if (lead) lead.textContent = "¡Ya podés canjear";
      if (value) value.textContent = "🎉";
      if (tail) tail.textContent = `${name}!`;
      if (note) note.textContent = "Reclamala en el local.";
    }
    return;
  }

  if (lead) lead.textContent = "¡Desbloqueaste";
  if (value) value.textContent = "todo";
  if (tail) tail.textContent = "el catálogo de premios!";
  if (note) note.textContent = "Sos leyenda BYR.";
}

function renderGuest() {
  document.querySelectorAll("[data-reward-bar]").forEach(bar => {
    bar.style.setProperty("--progress", "0%");
  });

  document.querySelectorAll("[data-reward-status]").forEach(status => {
    const card = status.closest("[data-reward]");
    const levelReq = Number(card?.dataset.level) || 1;
    status.textContent = levelReq > 1 ? `Nivel ${levelReq}` : "Canjeable con puntos";
  });

  document.querySelectorAll("[data-reward-caption]").forEach(caption => {
    if (caption.dataset.lockedCaption) {
      caption.textContent = caption.dataset.lockedCaption;
    }
  });

  document.querySelectorAll("[data-reward-action]").forEach(action => {
    action.classList.remove("redeem-action");
    action.classList.add("locked-action");
    action.disabled = false;
    action.textContent = "Registrate para canjear";
  });

  document.querySelectorAll(".premium-reward.available").forEach(card => {
    card.classList.remove("available");
  });

  renderMotivation({ guest: true });
}

function renderBeneficios() {
  document.body.classList.toggle("byr-guest", isGuest());

  if (isGuest()) {
    renderGuest();
    return;
  }

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

  renderMotivation({ guest: false, points, next });
}

/* Canje contra el SERVIDOR.

   Antes esto restaba los puntos en el navegador y mostraba
   "✓ ¡Canjeado!". No quedaba nada en la base: el admin no tenía qué
   validar, el socio no tenía qué mostrar en el local, y al recargar
   la página los puntos volvían.

   Ahora el servidor cobra los puntos y emite un vale con código, igual
   que los premios de la ruleta. El precio y el nivel los pone el
   servidor: cambiar el data-points desde la consola no abarata nada. */
async function handleRedeem(event) {
  const button = event.currentTarget;

  if (isGuest()) {
    window.location.href = LOGIN_URL;
    return;
  }

  const card = button.closest("[data-reward]");

  if (!card || button.disabled) {
    return;
  }

  const rewardId = card.dataset.reward;
  const original = button.textContent;

  button.disabled = true;
  button.textContent = "Canjeando…";

  let data = null;

  try {
    const res = await fetch("/api/perks/redeem.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId })
    });

    data = await res.json();

    if (!res.ok) {
      button.textContent = original;
      button.disabled = false;
      showRedeemMessage(card, (data && data.error) || "No se pudo canjear.");
      renderBeneficios();
      return;
    }
  } catch (error) {
    button.textContent = original;
    button.disabled = false;
    showRedeemMessage(card, "Sin conexión. Probá de nuevo en un momento.");
    return;
  }

  /* El servidor ya cobró los puntos y emitió el vale: nos ponemos al
     día con el estado que devolvió. */
  if (window.BYRProgress?.apply) {
    window.BYRProgress.apply(data);
  } else if (data.state && window.BYRUser?.replaceState) {
    window.BYRUser.replaceState(data.state);
    window.dispatchEvent(new CustomEvent("byr:user-updated"));
  }

  renderBeneficios();

  button.textContent = "✓ ¡Canjeado!";
  button.classList.add("redeemed");

  showRedeemMessage(
    card,
    `Tu código: ${data.code} — mostralo en el local. Lo tenés también en Mis cupones.`
  );

  window.setTimeout(() => {
    button.classList.remove("redeemed");
    renderBeneficios();
  }, 2600);
}

/* Deja el aviso debajo de la tarjeta, en el mismo lugar donde ya va la
   bajada. Se limpia solo al volver a dibujar. */
function showRedeemMessage(card, message) {
  const caption = card.querySelector("[data-reward-caption]");

  if (caption) {
    caption.textContent = message;
    caption.classList.add("redeem-message");
  }
}

/* =========================================================
   PRECIOS — los pone el servidor, no el HTML
   ---------------------------------------------------------
   El data-points y el "5.500 pts" que se ven en cada tarjeta son solo un
   valor de arranque, para que la página no aparezca en blanco ni parpadee
   mientras carga. El precio de verdad lo calcula el servidor desde la
   carta (api/perks/rewards.php), así que apenas contesta se reescriben
   los dos y se vuelve a dibujar.

   Si la consulta falla, no se toca nada: queda lo que trae el HTML, que
   son los mismos precios que el servidor calcula con la carta de hoy. Es
   preferible mostrar un precio de hace un rato que una tarjeta vacía — y
   el que cobra sigue siendo el servidor, así que nadie paga de menos por
   ver un número viejo.
========================================================= */

function applyRewardPrices(rewards) {
  rewards.forEach(reward => {
    document.querySelectorAll(`[data-reward="${reward.id}"]`).forEach(card => {
      card.dataset.points = String(reward.points);
      card.dataset.level = String(reward.level);

      /* El precio grande de la tarjeta. Las comunes lo llevan en
         .reward-points y la sección legendaria en .legendary-meta. Los
         otros textos (el "Te faltan X", el del botón) los reescribe
         updateRewardCard con este mismo número, así que no hace falta
         tocarlos acá. */
      const price = card.querySelector(".reward-points strong, .legendary-meta strong");
      if (price) {
        price.textContent = `${formatBenefitPoints(reward.points)} pts`;
      }
    });
  });

  renderBeneficios();
}

/* El aviso de transición, cuando los precios acaban de cambiar. El texto
   y hasta cuándo se muestra los decide el servidor: acá solo se pinta.
   Sin aviso, el recuadro se queda oculto y no ocupa lugar. */
function applyPriceNotice(notice) {
  const box = document.querySelector("[data-price-notice]");
  if (!box) return;

  if (!notice || !notice.body) {
    box.hidden = true;
    box.textContent = "";
    return;
  }

  /* textContent y no innerHTML: el aviso se edita desde config.php y no
     tiene por qué poder meter etiquetas en la página. */
  box.textContent = "";

  if (notice.title) {
    const title = document.createElement("p");
    title.innerHTML = "<strong></strong>";
    title.querySelector("strong").textContent = `📣 ${notice.title}`;
    box.append(title);
  }

  const body = document.createElement("p");
  body.textContent = notice.body;
  box.append(body);

  box.hidden = false;
}

async function loadRewardPrices() {
  try {
    const res = await fetch("/api/perks/rewards.php", { credentials: "same-origin" });
    if (!res.ok) return;

    const data = await res.json();
    if (Array.isArray(data?.rewards) && data.rewards.length) {
      applyRewardPrices(data.rewards);
    }
    applyPriceNotice(data?.notice);
  } catch (error) {
    /* Sin conexión: se queda con los precios del HTML. */
  }
}

document.querySelectorAll("[data-reward-action]").forEach(button => {
  button.addEventListener("click", handleRedeem);
});

window.addEventListener("focus", renderBeneficios);
window.addEventListener("pageshow", renderBeneficios);
window.addEventListener("storage", renderBeneficios);
window.addEventListener("byr:user-updated", renderBeneficios);
window.addEventListener("byr:auth-change", renderBeneficios);

renderBeneficios();
loadRewardPrices();
