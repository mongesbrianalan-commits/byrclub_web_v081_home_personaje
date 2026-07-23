(() => {
  "use strict";

  const wheel = document.getElementById("rouletteWheel");
  const spinMainButton = document.getElementById("spinWheelButton");
  const spinSecondaryButton = document.getElementById("spinWheelSecondaryButton");
  const rouletteStatus = document.getElementById("rouletteStatus");
  const liveStatus = document.getElementById("rouletteLiveStatus");
  const modal = document.getElementById("rouletteModal");
  const resultIcon = document.getElementById("rouletteResultIcon");
  const resultPrize = document.getElementById("rouletteResultPrize");
  const resultDescription = document.getElementById("rouletteResultDescription");
  const prizeCode = document.getElementById("roulettePrizeCode");
  const claimButton = document.getElementById("claimPrizeButton");
  const confettiLayer = document.getElementById("confettiLayer");

  if (!wheel || !spinMainButton || !spinSecondaryButton || !modal) return;

  const prizes = [
    { id: "points-50", label: "50 puntos", icon: "⭐", description: "Sumaste 50 puntos para seguir avanzando en BYR Club." },
    { id: "fries", label: "Papas gratis", icon: "🍟", description: "Desbloqueaste una porción de papas para canjear en BYR." },
    { id: "points-100", label: "100 puntos", icon: "⭐", description: "Sumaste 100 puntos a tu progreso de BYR Club." },
    { id: "surprise", label: "Premio sorpresa", icon: "🎁", description: "Ganaste una sorpresa especial. Consultá el premio al reclamar." },
    { id: "points-250", label: "250 puntos", icon: "🌟", description: "¡Premio grande! Sumaste 250 puntos a tu perfil." },
    { id: "drink", label: "Bebida gratis", icon: "🥤", description: "Desbloqueaste una bebida para acompañar tu próxima hamburguesa." },
    { id: "double-points", label: "2x puntos", icon: "🍔", description: "Tu próxima compra sumará el doble de puntos." },
    { id: "badge", label: "Insignia exclusiva", icon: "💎", description: "Desbloqueaste una insignia especial para tu perfil." }
  ];

  const STORAGE_KEY = "byrclub_roulette_last_spin";
  const RESULT_KEY = "byrclub_roulette_last_result";
  const SPIN_DURATION = 5200;
  let currentRotation = 0;
  let isSpinning = false;
  let currentPrize = null;
  let tickTimer = null;
  let audioContext = null;

  function getTodayKey() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  }

  function hasPlayedToday() {
    return localStorage.getItem(STORAGE_KEY) === getTodayKey();
  }

  function generatePrizeCode() {
    return `BYR-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function setButtonsDisabled(disabled) {
    spinMainButton.disabled = disabled;
    spinSecondaryButton.disabled = disabled;
    spinMainButton.classList.toggle("is-disabled", disabled);
    spinSecondaryButton.classList.toggle("is-disabled", disabled);
  }

  function updateDailyState() {
    if (!hasPlayedToday()) {
      rouletteStatus.textContent = "Disponible";
      rouletteStatus.classList.remove("played");
      liveStatus.innerHTML = '<span class="roulette-live-dot"></span><strong>Tu giro de hoy está disponible</strong>';
      spinMainButton.querySelector("span").textContent = "GIRAR";
      spinSecondaryButton.textContent = "Girar la ruleta";
      setButtonsDisabled(false);
      return;
    }

    rouletteStatus.textContent = "Jugado hoy";
    rouletteStatus.classList.add("played");
    liveStatus.innerHTML = '<span class="roulette-live-dot completed"></span><strong>Ya usaste tu giro. Volvé mañana.</strong>';
    spinMainButton.querySelector("span").textContent = "MAÑANA";
    spinSecondaryButton.textContent = "Volvé mañana";
    setButtonsDisabled(true);
  }

  function choosePrizeIndex() {
    const weightedPrizes = [0, 0, 0, 1, 2, 2, 2, 3, 4, 5, 6, 7];
    return weightedPrizes[Math.floor(Math.random() * weightedPrizes.length)];
  }

  function playTick() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(520, audioContext.currentTime);
      gain.gain.setValueAtTime(0.018, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.028);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.03);
    } catch (error) {
      // El audio es decorativo: la ruleta sigue funcionando aunque el navegador lo bloquee.
    }
  }

  function startTickSound() {
    stopTickSound();
    let delay = 85;
    const scheduleTick = () => {
      playTick();
      delay = Math.min(330, delay * 1.075);
      tickTimer = window.setTimeout(scheduleTick, delay);
    };
    scheduleTick();
  }

  function stopTickSound() {
    if (tickTimer) {
      window.clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  function highlightWinningSegment(prizeIndex) {
    const labels = wheel.querySelectorAll(".wheel-label");
    labels.forEach((label) => label.classList.remove("winning-label"));
    const winner = labels[prizeIndex];
    if (winner) winner.classList.add("winning-label");
    wheel.classList.add("winner-flash");
    window.setTimeout(() => wheel.classList.remove("winner-flash"), 1500);
  }

  function calculateTargetRotation(prizeIndex) {
    const segmentAngle = 360 / prizes.length;
    const segmentCenter = prizeIndex * segmentAngle + segmentAngle / 2;
    const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
    const targetNormalized = (360 - segmentCenter + 360) % 360;
    const deltaToTarget = (targetNormalized - normalizedCurrent + 360) % 360;
    const fullSpins = 6 + Math.floor(Math.random() * 3);
    const randomInsideSegment = Math.random() * (segmentAngle * 0.42) - segmentAngle * 0.21;
    return currentRotation + fullSpins * 360 + deltaToTarget + randomInsideSegment;
  }

  function spinWheel() {
    if (isSpinning || hasPlayedToday()) return;
    isSpinning = true;
    setButtonsDisabled(true);
    spinSecondaryButton.textContent = "Girando...";
    spinMainButton.querySelector("span").textContent = "...";

    const prizeIndex = choosePrizeIndex();
    currentPrize = prizes[prizeIndex];
    const targetRotation = calculateTargetRotation(prizeIndex);
    currentRotation = targetRotation;
    wheel.querySelectorAll(".wheel-label").forEach((label) => label.classList.remove("winning-label"));
    wheel.classList.add("is-spinning");
    startTickSound();
    wheel.style.transform = `rotate(${targetRotation}deg)`;

    window.setTimeout(() => {
      wheel.classList.remove("is-spinning");
      stopTickSound();
      highlightWinningSegment(prizeIndex);
const result = {
  prize: currentPrize,
  code: generatePrizeCode(),
  date: new Date().toISOString()
};

BYRUser.claimPrize(
  {
    ...currentPrize,
    code: result.code
  },
  "Ruleta diaria"
);

localStorage.setItem(STORAGE_KEY, getTodayKey());
localStorage.setItem(RESULT_KEY, JSON.stringify(result));

isSpinning = false;
      updateDailyState();
      window.setTimeout(() => openResultModal(currentPrize, result.code), 720);
    }, SPIN_DURATION + 120);
  }

  function openResultModal(prize, code) {
    resultIcon.textContent = prize.icon;
    resultPrize.textContent = prize.label;
    resultDescription.textContent = prize.description;
    prizeCode.textContent = code || generatePrizeCode();
    claimButton.textContent = "Reclamar premio";
    claimButton.disabled = false;
    claimButton.classList.remove("claimed");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.focus();
    launchConfetti();
  }

  function closeResultModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function launchConfetti() {
    confettiLayer.innerHTML = "";
    const symbols = ["●", "■", "▲", "★"];
    for (let index = 0; index < 90; index += 1) {
      const piece = document.createElement("span");
      piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.animationDelay = `${Math.random() * 0.7}s`;
      piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      piece.style.setProperty("--confetti-drift", `${-120 + Math.random() * 240}px`);
      piece.style.setProperty("--confetti-rotation", `${Math.random() * 900 - 450}deg`);
      confettiLayer.appendChild(piece);
    }
    window.setTimeout(() => { confettiLayer.innerHTML = ""; }, 5000);
  }

  spinMainButton.addEventListener("click", spinWheel);
  spinSecondaryButton.addEventListener("click", spinWheel);
  document.querySelectorAll("[data-close-roulette]").forEach((button) => button.addEventListener("click", closeResultModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) closeResultModal();
  });
  claimButton.addEventListener("click", () => {
    claimButton.textContent = "Premio guardado ✓";
    claimButton.disabled = true;
    claimButton.classList.add("claimed");
  });


  function isLocalDevelopment() {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname);
  }

  function createDeveloperControls() {
    if (!isLocalDevelopment()) return;

    const panel = document.createElement("aside");
    panel.className = "roulette-dev-panel";
    panel.setAttribute("aria-label", "Herramientas de prueba de la ruleta");
    panel.innerHTML = `
      <span>Modo prueba</span>
      <button type="button" id="resetRouletteDevButton">Reiniciar ruleta</button>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#resetRouletteDevButton").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RESULT_KEY);
      wheel.style.transform = "rotate(0deg)";
      currentRotation = 0;
      currentPrize = null;
      wheel.querySelectorAll(".wheel-label").forEach((label) => label.classList.remove("winning-label"));
      wheel.classList.remove("winner-flash", "is-spinning");
      closeResultModal();
      updateDailyState();
      panel.classList.add("is-confirmed");
      panel.querySelector("span").textContent = "Ruleta reiniciada ✓";
      window.setTimeout(() => {
        panel.classList.remove("is-confirmed");
        panel.querySelector("span").textContent = "Modo prueba";
      }, 1800);
    });
  }

  updateDailyState();
  createDeveloperControls();
})();
