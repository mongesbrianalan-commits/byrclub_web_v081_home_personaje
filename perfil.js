(() => {
  "use strict";

  const numberFormatter = new Intl.NumberFormat("es-AR");

  function formatNumber(value) {
    return numberFormatter.format(Math.max(0, Math.round(Number(value) || 0)));
  }

  /* =========================================
     CATÁLOGO DE PREMIOS (igual a beneficios.html)
  ========================================= */

  const REWARDS_CATALOG = [
    { id: "coca-cola", name: "Coca-Cola 500cc", points: 500, level: 1, image: "assets/rewards/coca-cola.jpg", tag: "🥤 Refrescante", description: "Para acompañar tu pedido como corresponde." },
    { id: "papas", name: "Porción de papas BYR", points: 900, level: 1, image: "assets/rewards/papas.png", tag: "🔥 Salen siempre", description: "El acompañamiento que nunca sobra." },
    { id: "cheese-burger", name: "Cheese Burger", points: 1800, level: 1, image: "assets/rewards/cheese-burger.jpg", tag: "🔥 Más canjeada", description: "El clásico que nunca falla." },
    { id: "doble-cheese", name: "Doble Cheese Burger", points: 2500, level: 1, image: "assets/rewards/doble-cheese.jpg", tag: "⭐ Favorita", description: "Más carne, más cheddar, más ganas." },
    { id: "cuarto-byr", name: "Cuarto de BYR", points: 3000, level: 1, image: "assets/rewards/cuarto-byr.jpg", tag: "🎉 Nueva", description: "El sabor clásico con sello BYR." },
    { id: "americana", name: "Americana", points: 3800, level: 1, image: "assets/rewards/americana.jpg", tag: "🔥 Bomba BYR", description: "Huevo, panceta, cebolla y BBQ. Una bomba." },
    { id: "cannons", name: "Cannons", points: 4500, level: 5, image: "assets/rewards/cannons.jpg", tag: "👑 Exclusiva", description: "Cheddar, panceta y bastones. Mucho BYR." },
    { id: "la-triple", name: "La Triple", points: 5200, level: 5, image: "assets/rewards/la-triple.jpg", tag: "👑 Épica", description: "Solo para los que van en serio." },
    { id: "combo-triple", name: "Combo Toddy", points: 8000, level: 6, image: "assets/rewards/combo-triple.png", tag: "👑 Legendaria", description: "Hamburguesa, papas y gaseosa. El premio máximo." }
  ];

  function findNextReward(points, level) {
    return REWARDS_CATALOG
      .filter(reward => points < reward.points || level < reward.level)
      .sort((a, b) => a.points - b.points)[0] || null;
  }

  /* =========================================
     HÉROE
  ========================================= */

  function renderHero(state, progression) {
    const points = Number(state.wallet?.points) || 0;
    const level = progression.level;
    const rank = window.BYRAppShell?.getRankFromLevel
      ? BYRAppShell.getRankFromLevel(level)
      : { name: "Novato", icon: "🌱" };

    document.querySelectorAll("[data-profile-name]").forEach(el => {
      el.textContent = state.profile?.name || "Usuario";
    });

    document.querySelectorAll("[data-profile-rank-icon]").forEach(el => {
      el.textContent = rank.icon;
    });

    document.querySelectorAll("[data-profile-rank-name]").forEach(el => {
      el.textContent = rank.name;
    });

    document.querySelectorAll("[data-profile-level]").forEach(el => {
      el.textContent = level;
    });

    document.querySelectorAll("[data-profile-points]").forEach(el => {
      el.textContent = formatNumber(points);
    });

    const mascotTitle = document.querySelector("[data-profile-mascot-title]");
    const mascotSub = document.querySelector("[data-profile-mascot-sub]");

    if (mascotTitle) {
      mascotTitle.textContent = progression.percentage >= 75
        ? "¡YA CASI SUBÍS!"
        : progression.percentage >= 35
          ? "¡VAS BIEN!"
          : "¡A SUMAR PUNTOS!";
    }

    if (mascotSub) {
      mascotSub.textContent = `Al Nivel ${level + 1}`;
    }

    const floatingXp = document.querySelector("[data-profile-floating-xp]");

    if (floatingXp) {
      floatingXp.textContent = `+${formatNumber(progression.earnedInsideLevel)} XP`;
    }
  }

  /* =========================================
     PROGRESO DE XP
  ========================================= */

  function renderXpCommand(progression) {
    const percentage = Math.round(progression.percentage);
    const remaining = Math.max(0, Math.round(progression.nextLevelXp - progression.totalXp));
    const pinPosition = Math.min(92, Math.max(8, percentage));

    document.querySelectorAll("[data-profile-next-level]").forEach(el => {
      el.textContent = progression.level + 1;
    });

    document.querySelectorAll("[data-profile-xp-percent]").forEach(el => {
      el.textContent = `${percentage}%`;
    });

    const track = document.querySelector("[data-profile-xp-track]");

    if (track) {
      track.setAttribute("aria-valuenow", String(percentage));
    }

    const fill = document.querySelector("[data-profile-xp-fill]");

    if (fill) {
      fill.style.setProperty("--xp", `${percentage}%`);
    }

    const pin = document.querySelector("[data-profile-xp-pin]");

    if (pin) {
      pin.textContent = `${formatNumber(progression.totalXp)} XP`;
      pin.style.left = `calc(${pinPosition}% - 47px)`;
    }

    document.querySelectorAll("[data-profile-xp-floor]").forEach(el => {
      el.textContent = formatNumber(progression.currentLevelXp);
    });

    document.querySelectorAll("[data-profile-xp-ceiling]").forEach(el => {
      el.textContent = formatNumber(progression.nextLevelXp);
    });

    document.querySelectorAll("[data-profile-xp-remaining]").forEach(el => {
      el.textContent = `Te faltan ${formatNumber(remaining)} XP`;
    });

    const caption = document.querySelector("[data-profile-xp-caption]");

    if (caption) {
      caption.textContent = remaining <= 100
        ? "¡Estás a un paso del próximo nivel!"
        : "Cada compra, juego o desafío te suma experiencia hacia tu próximo nivel.";
    }
  }

  /* =========================================
     PRÓXIMA RECOMPENSA
  ========================================= */

  function renderNextPrize(points, level) {
    const next = findNextReward(points, level);
    const prizeCard = document.querySelector("[data-profile-next-prize]");
    const unlockedCard = document.querySelector("[data-profile-all-unlocked]");

    if (!next) {
      if (prizeCard) prizeCard.hidden = true;
      if (unlockedCard) unlockedCard.hidden = false;
      return;
    }

    if (unlockedCard) unlockedCard.hidden = true;
    if (prizeCard) prizeCard.hidden = false;

    const percentage = Math.min(100, Math.round((points / next.points) * 100));
    const remaining = Math.max(0, next.points - points);

    const image = document.querySelector("[data-profile-prize-image]");
    const tag = document.querySelector("[data-profile-prize-tag]");
    const name = document.querySelector("[data-profile-prize-name]");
    const description = document.querySelector("[data-profile-prize-description]");
    const percentEl = document.querySelector("[data-profile-prize-percent]");
    const remainingEl = document.querySelector("[data-profile-prize-remaining]");
    const bar = document.querySelector("[data-profile-prize-bar]");
    const motivation = document.querySelector("[data-profile-prize-motivation]");

    if (image) image.src = next.image;
    if (image) image.alt = next.name;
    if (tag) tag.textContent = next.tag;
    if (name) name.textContent = next.name;
    if (description) description.textContent = next.description;
    if (percentEl) percentEl.textContent = `${percentage}% desbloqueado`;
    if (remainingEl) {
      remainingEl.textContent = level < next.level
        ? `Requiere Nivel ${next.level}`
        : `${formatNumber(remaining)} puntos restantes`;
    }
    if (bar) bar.style.setProperty("--xp", `${percentage}%`);
    if (motivation) {
      motivation.textContent = level < next.level
        ? `Llegá al Nivel ${next.level} para desbloquearla.`
        : remaining <= 300
          ? "Con una visita más, quedás muy cerca."
          : "Seguí jugando y sumando puntos para desbloquearla.";
    }
  }

  /* =========================================
     ESTADÍSTICAS
  ========================================= */

  function renderStats(state) {
    const history = state.history || [];

    const unlockedAchievements = window.BYRAchievementEngine?.getUnlocked
      ? BYRAchievementEngine.getUnlocked()
      : [];

    const totalAchievements = window.BYRAchievementRegistry?.getAll
      ? BYRAchievementRegistry.getAll().length
      : unlockedAchievements.length;

    document.querySelectorAll("[data-profile-stat-achievements]").forEach(el => {
      el.textContent = unlockedAchievements.length;
    });

    const achievementsSub = document.querySelector("[data-profile-stat-achievements-sub]");

    if (achievementsSub) {
      achievementsSub.textContent = totalAchievements
        ? `Sobre ${totalAchievements} en total`
        : "Sobre el total del catálogo";
    }

    const redemptions = history.filter(item =>
      item.type === "points" &&
      item.amount < 0 &&
      typeof item.reason === "string" &&
      item.reason.startsWith("Canje:")
    );

    document.querySelectorAll("[data-profile-stat-redeemed]").forEach(el => {
      el.textContent = redemptions.length;
    });

    const favoriteEl = document.querySelector("[data-profile-stat-favorite]");

    if (favoriteEl) {
      if (redemptions.length === 0) {
        favoriteEl.textContent = "Todavía sin canjes";
      } else {
        const counts = {};

        redemptions.forEach(item => {
          const label = item.reason.replace(/^Canje:\s*/, "");
          counts[label] = (counts[label] || 0) + 1;
        });

        const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        favoriteEl.textContent = favorite ? `Tu favorita: ${favorite[0]}` : "Todavía sin canjes";
      }
    }

    const visits = history.filter(item => item.type === "visit").length;

    document.querySelectorAll("[data-profile-stat-visits]").forEach(el => {
      el.textContent = visits;
    });

    const streakCurrent = window.BYRStreak?.getCurrent ? BYRStreak.getCurrent() : 0;
    const streakSub = document.querySelector("[data-profile-stat-streak]");

    if (streakSub) {
      streakSub.textContent = `Racha actual: ${streakCurrent} ${streakCurrent === 1 ? "día" : "días"}`;
    }

    const lifetimePoints = history.reduce((sum, item) => {
      if (item.type === "points" && item.amount > 0) return sum + item.amount;
      if (item.type === "prize" && item.points > 0) return sum + item.points;
      return sum;
    }, 0);

    document.querySelectorAll("[data-profile-stat-lifetime-points]").forEach(el => {
      el.textContent = formatNumber(lifetimePoints);
    });
  }

  /* =========================================
     LOGROS
  ========================================= */

  const MEDAL_CLASSES = ["bronze", "silver", "gold", "cheddar", "fire", "legend"];

  function renderAchievements() {
    const grid = document.querySelector("[data-profile-achievements-grid]");

    if (!grid || !window.BYRAchievementEngine?.getAllStatuses) {
      return;
    }

    window.BYRAchievementEngine.evaluate?.();

    const statuses = BYRAchievementEngine.getAllStatuses();

    grid.innerHTML = statuses.map((achievement, index) => {
      const unlocked = Boolean(achievement.status?.unlocked);
      const medalClass = MEDAL_CLASSES[index % MEDAL_CLASSES.length];
      const percentage = Math.min(100, Math.round(achievement.percentage || 0));

      return `
        <article class="achievement profile-visible ${unlocked ? "unlocked" : "locked"}">
          <div class="achievement-glow"></div>
          ${unlocked ? "" : '<div class="lock-mark">🔒</div>'}
          <div class="medal ${medalClass}">${achievement.icon || "🏅"}</div>
          <b>${achievement.name}</b>
          <span>${achievement.description || ""}</span>
          <small>${unlocked ? "DESBLOQUEADO" : `${percentage}% COMPLETADO`}</small>
          ${unlocked ? "" : `<div class="achievement-progress"><i style="--xp:${percentage}%"></i></div>`}
        </article>
      `;
    }).join("");
  }

  /* =========================================
     ACTIVIDAD RECIENTE
  ========================================= */

  function formatRelativeDate(isoDate) {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays <= 0) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `HOY · ${hours}:${minutes}`;
    }

    if (diffDays === 1) return "AYER";
    if (diffDays < 7) return `HACE ${diffDays} DÍAS`;

    const weeks = Math.floor(diffDays / 7);
    if (weeks < 5) return `HACE ${weeks} SEMANA${weeks > 1 ? "S" : ""}`;

    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).toUpperCase();
  }

  function describeHistoryItem(item) {
    if (item.type === "visit") {
      return { earned: true, title: "Visita diaria", description: "Sumaste tu racha de hoy.", amountLabel: null };
    }

    if (item.type === "prize") {
      const amount = item.points > 0 ? `+${formatNumber(item.points)} pts` : (item.xp > 0 ? `+${formatNumber(item.xp)} XP` : "🎁");
      return { earned: true, title: item.label || "Premio", description: `Ganado en ${item.source || "un juego"}.`, amountLabel: amount };
    }

    if (item.type === "xp") {
      return { earned: true, title: item.reason || "Experiencia ganada", description: "Sumaste experiencia BYR.", amountLabel: `+${formatNumber(item.amount)} XP` };
    }

    const earned = item.amount > 0;

    return {
      earned,
      title: item.reason || (earned ? "Puntos ganados" : "Canje"),
      description: earned ? "Sumaste puntos a tu cuenta." : "Recompensa retirada en el local.",
      amountLabel: `${earned ? "+" : "−"}${formatNumber(Math.abs(item.amount))} pts`
    };
  }

  function renderTimeline(state) {
    const timeline = document.querySelector("[data-profile-timeline]");

    if (!timeline) {
      return;
    }

    const items = (state.history || []).slice(0, 6);

    if (items.length === 0) {
      timeline.innerHTML = `<article class="timeline-item profile-visible earned"><div class="timeline-icon">+</div><div><span>SIN MOVIMIENTOS</span><h3>Todavía no hay actividad</h3><p>Jugá o sumá puntos para ver tu historial acá.</p></div></article>`;
      return;
    }

    timeline.innerHTML = items.map(item => {
      const info = describeHistoryItem(item);

      return `
        <article class="timeline-item profile-visible ${info.earned ? "earned" : "spent"}">
          <div class="timeline-icon">${info.earned ? "+" : "−"}</div>
          <div>
            <span>${formatRelativeDate(item.date)}</span>
            <h3>${info.title}</h3>
            <p>${info.description}</p>
          </div>
          ${info.amountLabel ? `<strong>${info.amountLabel}</strong>` : ""}
        </article>
      `;
    }).join("");
  }

  /* =========================================
     RACHA
  ========================================= */

  function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderStreak() {
    const streakState = window.BYRStreak?.getState ? BYRStreak.getState() : { current: 0, registeredDates: [] };
    const current = streakState.current || 0;

    const valueEl = document.querySelector("[data-profile-streak-value]");

    if (valueEl) {
      valueEl.textContent = `${current} ${current === 1 ? "día" : "días"}`;
    }

    const copyEl = document.querySelector("[data-profile-streak-copy]");

    if (copyEl) {
      copyEl.textContent = current === 0
        ? "Visitá BYR Club para empezar tu racha."
        : current < 7
          ? `Llevás ${current} ${current === 1 ? "día seguido" : "días seguidos"}. ¡No la cortes!`
          : `¡Racha de ${current} días! Sos parte de la casa.`;
    }

    const hintEl = document.querySelector("[data-profile-streak-hint]");
    const visitedToday = window.BYRStreak?.hasVisitedToday ? BYRStreak.hasVisitedToday() : false;

    if (hintEl) {
      hintEl.textContent = visitedToday
        ? "Ya sumaste hoy. Volvé mañana para seguir la racha."
        : "Todavía no visitaste hoy — no dejes que se corte.";
    }

    const weekRow = document.querySelector("[data-profile-week-row]");

    if (weekRow) {
      const registered = new Set(streakState.registeredDates || []);
      const labels = ["L", "M", "X", "J", "V", "S", "D"];
      const today = new Date();
      const todayIndex = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - todayIndex);

      weekRow.innerHTML = labels.map((label, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);

        const done = registered.has(getDateKey(day));
        const isToday = index === todayIndex;
        const className = isToday ? "today" : (done ? "done" : "");

        return `<i class="${className}">${label}</i>`;
      }).join("");
    }
  }

  /* =========================================
     CAMINO DE RANGOS
  ========================================= */

  function renderRankRoadmap(level) {
    const steps = document.querySelectorAll("[data-rank-threshold]");

    if (!steps.length) {
      return;
    }

    const thresholds = Array.from(steps).map(step => Number(step.dataset.rankThreshold) || 1);
    let currentIndex = 0;

    thresholds.forEach((threshold, index) => {
      if (level >= threshold) {
        currentIndex = index;
      }
    });

    steps.forEach((step, index) => {
      const hereLabel = step.querySelector("[data-rank-here]");

      step.classList.toggle("complete", index < currentIndex);
      step.classList.toggle("current", index === currentIndex);

      if (hereLabel) {
        hereLabel.hidden = index !== currentIndex;
      }
    });

    const rankLine = document.querySelector("[data-profile-rank-line]");

    if (rankLine) {
      const progress = thresholds.length > 1
        ? (currentIndex / (thresholds.length - 1)) * 100
        : 0;

      rankLine.style.setProperty("--rank-progress", `${progress}%`);
    }
  }

  /* =========================================
     RENDER GENERAL
  ========================================= */

  function render() {
    if (!window.BYRUser?.getState) {
      return;
    }

    const state = BYRUser.getState();
    const progression = BYRUser.getProgression();
    const points = Number(state.wallet?.points) || 0;
    const level = progression.level;

    renderHero(state, progression);
    renderXpCommand(progression);
    renderNextPrize(points, level);
    renderStats(state);
    renderAchievements();
    renderTimeline(state);
    renderStreak();
    renderRankRoadmap(level);
  }

  window.addEventListener("focus", render);
  window.addEventListener("pageshow", render);
  window.addEventListener("storage", render);
  window.addEventListener("byr:user-updated", render);

  render();
})();
