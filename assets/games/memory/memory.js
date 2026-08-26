(() => {
  "use strict";

  /* La partida diaria la controla el SERVIDOR (api/memory/finish.php).
     Estas dos claves son solo una pista local para no mostrar el tablero
     jugable un segundo y tener que sacárselo cuando contesta el servidor:
     borrarlas no habilita otra partida. */
  const STORAGE_KEY = "byr-memory-last-play";
  const RESULT_KEY = "byr-memory-result";

  const STATUS_URL = "/api/memory/status.php";
  const FINISH_URL = "/api/memory/finish.php";

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
  const retryButton = document.getElementById("retrySaveButton");

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
  let playedToday = false;
  let isSaving = false;

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

  /* Le pregunta al servidor si la partida de hoy sigue disponible.
     Devuelve null si no se pudo averiguar (sin conexión). */
  async function fetchDailyStatus() {
    try {
      const res = await fetch(STATUS_URL, { credentials: "same-origin" });
      const data = await res.json();

      if (data && typeof data.playedToday === "boolean") {
        return data;
      }
    } catch (error) {
      /* sin conexión: nos quedamos con la pista local */
    }

    return null;
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

  function finishGame() {
    if (isFinished) {
      return;
    }

    isFinished = true;
    stopTimer();
    updateProgress();

    saveGame();
  }

  /* Cierra la partida contra el servidor: él controla que sea una por día,
     calcula el premio y acredita los puntos. El cliente no decide nada de
     eso, solo cuenta cuántos intentos hizo. */
  async function saveGame() {
    if (isSaving) {
      return;
    }

    isSaving = true;
    setRetryVisible(false);
    statusText.textContent = "Guardando tu premio…";

    const previousState = window.BYRUser?.getState
      ? BYRUser.getState()
      : null;
    const previousProgression = window.BYRUser?.getProgression
      ? BYRUser.getProgression()
      : null;

    const previousPoints = Number(previousState?.wallet?.points) || 0;
    const previousXp = Number(previousState?.progression?.xp) || 0;
    const previousLevel = Number(previousProgression?.level) || 1;

    let data;

    try {
      const res = await fetch(FINISH_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, seconds: elapsedSeconds })
      });

      data = await res.json();

      if (!res.ok) {
        isSaving = false;

        if (data && data.code === "already-played") {
          /* Jugó en otro navegador o en otro celular. */
          playedToday = true;
          localStorage.setItem(STORAGE_KEY, getTodayKey());
          statusText.textContent =
            "Ya jugaste hoy. Mañana vas a tener una nueva partida.";
          return;
        }

        statusText.textContent =
          (data && data.error) ||
          "No pudimos guardar tu premio. Probá de nuevo.";
        setRetryVisible(true);
        return;
      }
    } catch (error) {
      isSaving = false;
      statusText.textContent =
        "Sin conexión: no pudimos guardar tu premio. Probá de nuevo.";
      setRetryVisible(true);
      return;
    }

    isSaving = false;

    const reward = data.reward || {};

    /* El servidor ya sumó puntos y XP, y ya evaluó si esta partida
       desbloqueó un logro o completó una misión. Acá solo nos ponemos al
       día con lo que devolvió (no volvemos a sumar nada); los cartelitos
       los dispara BYRProgress con las novedades de la misma respuesta. */
    if (window.BYRProgress?.apply) {
      window.BYRProgress.apply(data);
    } else if (data.state && window.BYRUser?.replaceState) {
      BYRUser.replaceState(data.state);
      window.dispatchEvent(new CustomEvent("byr:user-updated"));

      if (window.BYRAppShell?.sync) {
        BYRAppShell.sync();
      }
    }

    const result = {
      moves,
      seconds: elapsedSeconds,
      points: reward.points,
      xp: reward.xp,
      completedAt: new Date().toISOString()
    };

    playedToday = true;
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
    const updatedProgression = window.BYRUser?.getProgression
      ? BYRUser.getProgression()
      : null;

    const updatedPoints = Number(updatedState?.wallet?.points) || 0;
    const updatedXp = Number(updatedState?.progression?.xp) || 0;
    const updatedLevel = Number(updatedProgression?.level) || 1;

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

  /* Deja el tablero listo para una partida nueva. */
  function startFreshBoard() {
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    moves = 0;
    matchedPairs = 0;
    isFinished = false;
    elapsedSeconds = 0;
    stopTimer();
    timeValue.textContent = formatTime(0);

    buildBoard(false);
    updateProgress();
  }

  function setRetryVisible(visible) {
    if (retryButton) {
      retryButton.hidden = !visible;
    }
  }

  function resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESULT_KEY);
    window.location.reload();
  }

  async function initializeGame() {
    /* Arrancamos con la pista local para que no parpadee el tablero, pero
       la palabra final sobre "ya jugaste hoy" la tiene el servidor. */
    playedToday = localStorage.getItem(STORAGE_KEY) === getTodayKey();

    if (playedToday) {
      loadCompletedState();
    } else {
      startFreshBoard();
      lockBoard = true; /* hasta que el servidor confirme */
      statusText.textContent = "Preparando tu partida…";
    }

    const status = await fetchDailyStatus();

    if (!status) {
      /* Sin conexión: dejamos jugar. Si al terminar sigue sin haber red,
         el premio no se guarda y se avisa con el botón de reintentar. */
      if (!playedToday) {
        lockBoard = false;
        statusText.textContent =
          "Encontrá las 8 parejas para reclamar tu premio del día.";
      }
      return;
    }

    if (status.ready === false) {
      /* Falta correr la migración: mejor avisar antes que dejar jugar
         una partida entera y no poder acreditar el premio. */
      lockBoard = true;
      statusText.textContent =
        "El Memotest vuelve en un rato. Mientras tanto, probá la ruleta o la raspadita.";
      return;
    }

    if (status.playedToday) {
      if (!playedToday) {
        playedToday = true;
        localStorage.setItem(STORAGE_KEY, getTodayKey());
        loadCompletedState();
      }
      return;
    }

    if (playedToday) {
      /* El servidor dice que la partida de hoy sigue disponible (cambió el
         día, o la pista local quedó vieja): tablero nuevo. */
      playedToday = false;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RESULT_KEY);
      startFreshBoard();
    }

    lockBoard = false;
    statusText.textContent =
      "Encontrá las 8 parejas para reclamar tu premio del día.";
  }

  closeWinOverlay.addEventListener("click", closeOverlay);
  resetButton.addEventListener("click", resetGame);

  if (retryButton) {
    retryButton.addEventListener("click", saveGame);
  }

  winOverlay.addEventListener("click", (event) => {
    if (event.target === winOverlay) {
      closeOverlay();
    }
  });

  initializeGame();
})();
