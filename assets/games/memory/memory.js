(() => {
  "use strict";

  const STORAGE_KEY = "byr-memory-last-play";
  const RESULT_KEY = "byr-memory-result";

  /* 8 parejas temáticas de BYR Club. */
  const CARD_ICONS = ["🍔", "🍟", "🥤", "⭐", "🎁", "💎", "🔥", "⚽"];
  const TOTAL_PAIRS = CARD_ICONS.length;

  const grid = document.getElementById("memoryGrid");
  const pairsValue = document.getElementById("pairsValue");
  const movesValue = document.getElementById("movesValue");
  const timeValue = document.getElementById("timeValue");

  const progressBar = document.getElementById("memoryProgressBar");
  const progressText = document.getElementById("memoryProgressText");
  const progressTitle = document.getElementById("progressTitle");
  const statusText = document.getElementById("memoryStatus");
  const resetButton = document.getElementById("resetMemoryButton");

  const characterImage = document.querySelector(".character-image");

  const winOverlay = document.getElementById("winOverlay");
  const closeWinOverlay = document.getElementById("closeWinOverlay");
  const winKicker = document.getElementById("winKicker");
  const winIcon = document.getElementById("winIcon");
  const winTitle = document.getElementById("winTitle");
  const winSummary = document.getElementById("winSummary");
  const winPoints = document.getElementById("winPoints");
  const winXp = document.getElementById("winXp");
  const confetti = document.getElementById("confetti");

  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let moves = 0;
  let matchedPairs = 0;
  let isFinished = false;

  let timerId = null;
  let startTime = 0;
  let elapsedSeconds = 0;

  function getTodayKey() {
    const now = new Date();

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function hasPlayedToday() {
    return localStorage.getItem(STORAGE_KEY) === getTodayKey();
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function buildBoard(revealAll = false) {
    grid.innerHTML = "";

    const deck = shuffle(
      CARD_ICONS.concat(CARD_ICONS).map((icon, index) => ({
        icon,
        key: index
      }))
    );

    deck.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "memory-card";
      button.setAttribute("role", "gridcell");
      button.dataset.icon = card.icon;

      button.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-face card-face--back"></div>' +
        `<div class="card-face card-face--front">${card.icon}</div>` +
        "</div>";

      if (revealAll) {
        button.classList.add("is-matched");
        button.disabled = true;
      } else {
        button.addEventListener("click", () => onCardClick(button));
      }

      grid.appendChild(button);
    });
  }

  function startTimer() {
    if (timerId || isFinished) {
      return;
    }

    startTime = Date.now();

    timerId = window.setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      timeValue.textContent = formatTime(elapsedSeconds);
    }, 500);
  }

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function updateProgress() {
    const percentage = Math.round((matchedPairs / TOTAL_PAIRS) * 100);

    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${matchedPairs} / ${TOTAL_PAIRS} parejas`;
    pairsValue.textContent = `${matchedPairs} / ${TOTAL_PAIRS}`;
    movesValue.textContent = String(moves);

    if (matchedPairs === 0) {
      progressTitle.textContent = "Empezá a jugar";
    } else if (matchedPairs < TOTAL_PAIRS / 2) {
      progressTitle.textContent = "¡Buen comienzo!";
    } else if (matchedPairs < TOTAL_PAIRS) {
      progressTitle.textContent = "¡Ya falta poco!";
    } else {
      progressTitle.textContent = "¡Tablero completado!";
    }
  }

  function onCardClick(card) {
    if (
      lockBoard ||
      isFinished ||
      card === firstCard ||
      card.classList.contains("is-matched") ||
      card.classList.contains("is-flipped")
    ) {
      return;
    }

    startTimer();

    card.classList.add("is-flipped");

    if (window.BYRAudio) {
      BYRAudio.scratch();
    }

    if (!firstCard) {
      firstCard = card;
      return;
    }

    secondCard = card;
    moves += 1;
    movesValue.textContent = String(moves);

    checkForMatch();
  }

  function checkForMatch() {
    const isMatch = firstCard.dataset.icon === secondCard.dataset.icon;

    if (isMatch) {
      handleMatch();
    } else {
      handleMismatch();
    }
  }

  function handleMatch() {
    lockBoard = true;

    window.setTimeout(() => {
      firstCard.classList.add("is-matched");
      secondCard.classList.add("is-matched");
      firstCard.disabled = true;
      secondCard.disabled = true;

      matchedPairs += 1;
      updateProgress();

      if (window.BYRAudio) {
        BYRAudio.reveal();
      }

      resetTurn();

      if (matchedPairs === TOTAL_PAIRS) {
        finishGame();
      }
    }, 320);
  }

  function handleMismatch() {
    lockBoard = true;

    window.setTimeout(() => {
      firstCard.classList.remove("is-flipped");
      secondCard.classList.remove("is-flipped");
      resetTurn();
    }, 820);
  }

  function resetTurn() {
    firstCard = null;
    secondCard = null;
    lockBoard = false;
  }

  function calculateReward() {
    /* Base por completar + bonus por eficiencia (menos intentos = mejor). */
    let points = 60;
    let xp = 40;
    let tier = "¡Tablero completado!";
    let kicker = "¡Completaste el Memotest!";

    if (moves <= TOTAL_PAIRS + 2) {
      points += 60;
      xp += 30;
      tier = "¡Memoria de campeón!";
      kicker = "¡Casi perfecto!";
    } else if (moves <= TOTAL_PAIRS * 2) {
      points += 30;
      xp += 15;
      tier = "¡Muy buena memoria!";
      kicker = "¡Gran partida!";
    }

    return { points, xp, tier, kicker };
  }

  function finishGame() {
    if (isFinished) {
      return;
    }

    isFinished = true;
    stopTimer();
    updateProgress();

    const reward = calculateReward();

    const previousState = window.BYRUser?.getState
      ? BYRUser.getState()
      : null;

    const previousPoints = Number(previousState?.wallet?.points) || 0;
    const previousXp = Number(previousState?.progression?.xp) || 0;
    const previousLevel = Number(previousState?.progression?.level) || 1;

    if (window.BYRUser?.addPoints) {
      BYRUser.addPoints(reward.points, "Memotest BYR");
    }

    if (window.BYRUser?.addXp) {
      BYRUser.addXp(reward.xp, "Memotest BYR");
    }

    if (window.BYRMissionEngine?.track) {
      BYRMissionEngine.track("memory");
      BYRMissionEngine.track("game");
    }

    if (window.BYRAchievementEngine?.track) {
      BYRAchievementEngine.track("memory");
    }

    const result = {
      moves,
      seconds: elapsedSeconds,
      points: reward.points,
      xp: reward.xp,
      completedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, getTodayKey());
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));

    if (characterImage) {
      characterImage.classList.add("is-celebrating");
      window.setTimeout(
        () => characterImage.classList.remove("is-celebrating"),
        900
      );
    }

    statusText.textContent =
      "¡Listo! Tu premio ya está guardado en tu perfil de BYR Club.";

    if (window.BYREffects) {
      BYREffects.points(reward.points, {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.6
      });

      window.setTimeout(() => {
        BYREffects.xp(reward.xp, {
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.64
        });
      }, 320);
    }

    updateHud(previousPoints, previousXp, previousLevel);

    if (window.BYRAudio) {
      BYRAudio.claim();
    }

    window.setTimeout(() => showWinOverlay(reward), 620);
  }

  function updateHud(previousPoints, previousXp, previousLevel) {
    if (!window.BYRHUD || !window.BYRUser?.getState) {
      return;
    }

    const updatedState = BYRUser.getState();
    const updatedPoints = Number(updatedState?.wallet?.points) || 0;
    const updatedXp = Number(updatedState?.progression?.xp) || 0;
    const updatedLevel = Number(updatedState?.progression?.level) || 1;

    BYRHUD.updatePoints({
      from: previousPoints,
      to: updatedPoints,
      duration: 950
    });

    window.setTimeout(() => {
      BYRHUD.updateXp({
        from: previousXp,
        to: updatedXp,
        duration: 950
      });

      BYRHUD.sync({ duration: 950 });
    }, 250);

    if (updatedLevel > previousLevel) {
      window.setTimeout(() => {
        BYRHUD.updateLevel(updatedLevel);

        if (window.BYREffects) {
          BYREffects.levelUp(updatedLevel);
        }
      }, 900);
    }
  }

  function showWinOverlay(reward) {
    winKicker.textContent = reward.kicker;
    winIcon.textContent = "🧠";
    winTitle.textContent = reward.tier;
    winSummary.textContent =
      `Encontraste las ${TOTAL_PAIRS} parejas en ${moves} intentos ` +
      `y ${formatTime(elapsedSeconds)} minutos.`;
    winPoints.textContent = `+${reward.points}`;
    winXp.textContent = `+${reward.xp}`;

    winOverlay.classList.add("is-visible");
    winOverlay.setAttribute("aria-hidden", "false");

    createConfetti();
  }

  function closeOverlay() {
    winOverlay.classList.remove("is-visible");
    winOverlay.setAttribute("aria-hidden", "true");
    confetti.innerHTML = "";
  }

  function createConfetti() {
    confetti.innerHTML = "";

    const colors = [
      "#ffd51f",
      "#ff3f87",
      "#36d98b",
      "#1685ff",
      "#ffffff",
      "#ff7b20"
    ];

    for (let index = 0; index < 90; index += 1) {
      const piece = document.createElement("span");

      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background =
        colors[Math.floor(Math.random() * colors.length)];

      piece.style.setProperty("--duration", `${2.4 + Math.random() * 2.2}s`);
      piece.style.setProperty("--drift", `${-130 + Math.random() * 260}px`);
      piece.style.setProperty("--rotation", `${360 + Math.random() * 900}deg`);
      piece.style.animationDelay = `${Math.random() * 0.45}s`;

      confetti.appendChild(piece);
    }
  }

  function loadCompletedState() {
    buildBoard(true);

    matchedPairs = TOTAL_PAIRS;
    isFinished = true;

    let result = null;

    try {
      result = JSON.parse(localStorage.getItem(RESULT_KEY));
    } catch (error) {
      result = null;
    }

    if (result) {
      moves = Number(result.moves) || 0;
      elapsedSeconds = Number(result.seconds) || 0;
      timeValue.textContent = formatTime(elapsedSeconds);
    }

    updateProgress();
    progressTitle.textContent = "Premio de hoy";

    statusText.textContent =
      "Ya jugaste hoy. Mañana vas a tener una nueva partida.";
  }

  function resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESULT_KEY);
    window.location.reload();
  }

  function initializeGame() {
    if (hasPlayedToday()) {
      loadCompletedState();
      return;
    }

    buildBoard(false);
    updateProgress();
  }

  closeWinOverlay.addEventListener("click", closeOverlay);
  resetButton.addEventListener("click", resetGame);

  winOverlay.addEventListener("click", (event) => {
    if (event.target === winOverlay) {
      closeOverlay();
    }
  });

  initializeGame();
})();
