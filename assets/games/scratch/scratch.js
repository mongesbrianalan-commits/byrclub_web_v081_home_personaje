(() => {
  "use strict";

  const STORAGE_KEY = "byr-scratch-last-play";
  const RESULT_KEY = "byr-scratch-result";
  const REVEAL_THRESHOLD = 60;
  const BRUSH_RADIUS = 31;

  const canvas = document.getElementById("scratchCanvas");
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  const scratchArea = document.getElementById("scratchArea");
  const scratchTicket = document.getElementById("scratchTicket");
  const scratchHint = document.getElementById("scratchHint");
  const coinCursor = document.getElementById("coinCursor");

  const progressBar = document.getElementById("scratchProgressBar");
  const progressText = document.getElementById("scratchProgressText");
  const progressTitle = document.getElementById("progressTitle");

  const claimButton = document.getElementById("claimPrizeButton");
  const statusText = document.getElementById("scratchStatus");
  const resetButton = document.getElementById("resetScratchButton");

  const prizeIcon = document.getElementById("prizeIcon");
  const prizeTitle = document.getElementById("prizeTitle");
  const prizeXp = document.getElementById("prizeXp");

  const scratchParticles = document.getElementById("scratchParticles");
const prizeShine = document.getElementById("prizeShine");
const prizeContent = document.getElementById("prizeContent");
const characterImage = document.querySelector(".character-image");

  const ticketNumber = document.getElementById("ticketNumber");

  const winOverlay = document.getElementById("winOverlay");
  const closeWinOverlay = document.getElementById("closeWinOverlay");

  const winPrizeIcon = document.getElementById("winPrizeIcon");
  const winPrizeTitle = document.getElementById("winPrizeTitle");
  const winPrizeXp = document.getElementById("winPrizeXp");
  const confetti = document.getElementById("confetti");

  const scratchPrizes = [
    {
      id: "points-50",
      label: "50 puntos",
      icon: "⭐",
      xp: 25,
      weight: 32
    },
    {
      id: "points-100",
      label: "100 puntos",
      icon: "💯",
      xp: 35,
      weight: 23
    },
    {
      id: "points-250",
      label: "250 puntos",
      icon: "🏆",
      xp: 50,
      weight: 8
    },
    {
      id: "fries",
      label: "Papas gratis",
      icon: "🍟",
      xp: 20,
      weight: 15
    },
    {
      id: "drink",
      label: "Bebida gratis",
      icon: "🥤",
      xp: 20,
      weight: 14
    },
    {
      id: "surprise",
      label: "Premio sorpresa",
      icon: "🎁",
      xp: 25,
      weight: 6
    },
    {
      id: "badge",
      label: "Insignia exclusiva",
      icon: "💎",
      xp: 40,
      weight: 2
    }
  ];

  let selectedPrize = null;
  let isDrawing = false;
  let isRevealed = false;
  let isClaimed = false;
  let lastPoint = null;
  let progressCheckTimer = null;

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

  function chooseWeightedPrize() {
    const totalWeight = scratchPrizes.reduce(
      (total, prize) => total + prize.weight,
      0
    );

    let randomValue = Math.random() * totalWeight;

    for (const prize of scratchPrizes) {
      randomValue -= prize.weight;

      if (randomValue <= 0) {
        return prize;
      }
    }

    return scratchPrizes[0];
  }

  function generatePrizeCode() {
    const randomPart = Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase();

    return `SCR-${Date.now().toString().slice(-5)}-${randomPart}`;
  }

  function generateTicketNumber() {
    const number = Math.floor(100000 + Math.random() * 900000);
    ticketNumber.textContent = `#BYR-${number}`;
  }

  function renderPrize() {
    prizeIcon.textContent = selectedPrize.icon;
    prizeTitle.textContent = selectedPrize.label;
    prizeXp.textContent = `+${selectedPrize.xp} XP`;
  }

  function resizeCanvas() {
    const rect = scratchArea.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    drawMetalSurface(rect.width, rect.height);
  }

  function drawMetalSurface(width, height) {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);

    gradient.addColorStop(0, "#7a7f86");
    gradient.addColorStop(0.18, "#e6e8ea");
    gradient.addColorStop(0.4, "#8c9298");
    gradient.addColorStop(0.58, "#f5f6f7");
    gradient.addColorStop(0.78, "#92979d");
    gradient.addColorStop(1, "#d9dcdf");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#30343a";
    ctx.lineWidth = 1;

    for (let line = -height; line < width + height; line += 8) {
      ctx.beginPath();
      ctx.moveTo(line, 0);
      ctx.lineTo(line - height, height);
      ctx.stroke();
    }

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = "#ffffff";

    for (let i = 0; i < 800; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2.2;

      ctx.fillRect(x, y, size, size);
    }

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#313841";
    ctx.font = `900 ${Math.min(width * 0.23, 150)}px "Lilita One"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BYR", width / 2, height / 2);
    ctx.restore();

    drawMetalShine(width, height);
  }

  function drawMetalShine(width, height) {
    const shine = ctx.createLinearGradient(0, 0, width, 0);

    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.38, "rgba(255,255,255,0)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.48)");
    shine.addColorStop(0.62, "rgba(255,255,255,0)");
    shine.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, width, height);
  }

  function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches ? event.touches[0] : event;

    return {
      x: pointer.clientX - rect.left,
      y: pointer.clientY - rect.top
    };
  }

  function eraseCircle(point) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";

    const brush = ctx.createRadialGradient(
      point.x,
      point.y,
      2,
      point.x,
      point.y,
      BRUSH_RADIUS
    );

    brush.addColorStop(0, "rgba(0,0,0,1)");
    brush.addColorStop(0.72, "rgba(0,0,0,1)");
    brush.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = brush;
    ctx.beginPath();
    ctx.arc(point.x, point.y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function eraseLine(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 8));

    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;

      eraseCircle({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress
      });
    }
  }

  function updateCoinCursor(point) {
    coinCursor.style.left = `${point.x}px`;
    coinCursor.style.top = `${point.y}px`;
  }

  function createScratchDust(point) {
  if (!scratchParticles || Math.random() > 0.38) {
    return;
  }

  const amount = 2 + Math.floor(Math.random() * 3);

  for (let index = 0; index < amount; index += 1) {
    const particle = document.createElement("span");

    particle.className = "scratch-dust";
    particle.style.left = `${point.x}px`;
    particle.style.top = `${point.y}px`;

    particle.style.setProperty(
      "--dust-size",
      `${2 + Math.random() * 5}px`
    );

    particle.style.setProperty(
      "--dust-x",
      `${-28 + Math.random() * 56}px`
    );

    particle.style.setProperty(
      "--dust-y",
      `${-35 + Math.random() * 55}px`
    );

    particle.style.setProperty(
      "--dust-rotation",
      `${Math.random() * 420}deg`
    );

    scratchParticles.appendChild(particle);

    window.setTimeout(() => {
      particle.remove();
    }, 700);
  }
}

  function startDrawing(event) {
    if (isRevealed || hasPlayedToday()) {
      return;
    }

    event.preventDefault();

    isDrawing = true;
    lastPoint = getPointerPosition(event);

    scratchHint.classList.add("is-hidden");
    coinCursor.classList.add("is-visible");

updateCoinCursor(lastPoint);
eraseCircle(lastPoint);

createScratchDust(lastPoint);
coinCursor.classList.add("is-scratching");
  }

  function draw(event) {
    if (!isDrawing || isRevealed) {
      return;
    }

    event.preventDefault();

    const currentPoint = getPointerPosition(event);

    updateCoinCursor(currentPoint);
    eraseLine(lastPoint, currentPoint);
createScratchDust(currentPoint);
    lastPoint = currentPoint;

    scheduleProgressCheck();
  }

function stopDrawing() {
  isDrawing = false;
  lastPoint = null;

  coinCursor.classList.remove("is-scratching");
}

  function hideCoinCursor() {
    if (!isDrawing) {
      coinCursor.classList.remove("is-visible");
    }
  }

  function scheduleProgressCheck() {
    if (progressCheckTimer) {
      return;
    }

    progressCheckTimer = window.setTimeout(() => {
      progressCheckTimer = null;
      updateScratchProgress();
    }, 120);
  }

  function calculateRevealedPercentage() {
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height).data;

    let transparentPixels = 0;
    let sampledPixels = 0;

    for (let index = 3; index < imageData.length; index += 80) {
      sampledPixels += 1;

      if (imageData[index] < 40) {
        transparentPixels += 1;
      }
    }

    return Math.min(
      100,
      Math.round((transparentPixels / sampledPixels) * 100)
    );
  }

  function updateScratchProgress() {
    if (isRevealed) {
      return;
    }

    const percentage = calculateRevealedPercentage();

    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}% revelado`;

    if (percentage > 0 && percentage < 30) {
      progressTitle.textContent = "¡Seguí raspando!";
    }

    if (percentage >= 30 && percentage < REVEAL_THRESHOLD) {
      progressTitle.textContent = "¡Ya falta poco!";
    }

    if (percentage >= REVEAL_THRESHOLD) {
      revealPrize();
    }
  }

  function revealPrize() {
    if (isRevealed) {
      return;
    }

    isRevealed = true;
    isDrawing = false;

    canvas.style.transition = "opacity 420ms ease";
    canvas.style.opacity = "0";

    coinCursor.classList.remove("is-visible");
    scratchHint.classList.add("is-hidden");
    scratchTicket.classList.add("is-revealed");
scratchTicket.classList.add("is-celebrating");
scratchArea.classList.add("is-glowing");
prizeContent.classList.add("is-winning");

if (characterImage) {
  characterImage.classList.add("is-celebrating");
}

prizeShine.classList.remove("is-active");

window.setTimeout(() => {
  prizeShine.classList.add("is-active");
}, 250);

window.setTimeout(() => {
  scratchTicket.classList.remove("is-celebrating");

  if (characterImage) {
    characterImage.classList.remove("is-celebrating");
  }
}, 900);

window.setTimeout(() => {
  prizeShine.classList.remove("is-active");
}, 1500);
    progressBar.style.width = "100%";
    progressText.textContent = "100% revelado";
    progressTitle.textContent = "¡Premio descubierto!";

    claimButton.disabled = false;
    statusText.textContent = "¡Lo encontraste! Ahora reclamá tu premio.";
  }

  function claimPrize() {
    if (!isRevealed || isClaimed || hasPlayedToday()) {
      return;
    }

    const prizeCode = generatePrizeCode();

    const claimed = window.BYRUser?.claimPrize(
      {
        id: selectedPrize.id,
        label: selectedPrize.label,
        code: prizeCode
      },
      "Raspadita diaria"
    );

    if (!claimed) {
      statusText.textContent =
        "No se pudo registrar el premio. Revisá la consola.";
      return;
    }

    isClaimed = true;

    const result = {
      prize: selectedPrize,
      code: prizeCode,
      claimedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, getTodayKey());
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));

    claimButton.disabled = true;
    claimButton.textContent = "Premio reclamado";

    statusText.textContent =
      "Tu premio ya está guardado en tu perfil de BYR Club.";

    showWinOverlay();
  }

  function showWinOverlay() {
    winPrizeIcon.textContent = selectedPrize.icon;
    winPrizeTitle.textContent = selectedPrize.label;
    winPrizeXp.textContent = `+${selectedPrize.xp} XP sumados`;

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

      piece.style.setProperty(
        "--duration",
        `${2.4 + Math.random() * 2.2}s`
      );

      piece.style.setProperty(
        "--drift",
        `${-130 + Math.random() * 260}px`
      );

      piece.style.setProperty(
        "--rotation",
        `${360 + Math.random() * 900}deg`
      );

      piece.style.animationDelay = `${Math.random() * 0.45}s`;

      confetti.appendChild(piece);
    }
  }

  function loadCompletedState() {
    const savedResult = localStorage.getItem(RESULT_KEY);

    if (!savedResult) {
      return;
    }

    try {
      const result = JSON.parse(savedResult);

      if (!result.prize) {
        return;
      }

      selectedPrize = result.prize;
      renderPrize();

      isRevealed = true;
      isClaimed = true;

      canvas.style.opacity = "0";
      canvas.style.pointerEvents = "none";

      scratchHint.classList.add("is-hidden");

      progressBar.style.width = "100%";
      progressText.textContent = "100% revelado";
      progressTitle.textContent = "Premio de hoy";

      claimButton.disabled = true;
      claimButton.textContent = "Premio reclamado";

      statusText.textContent =
        "Ya jugaste hoy. Mañana vas a tener una nueva oportunidad.";
    } catch (error) {
      console.error("No se pudo recuperar la raspadita:", error);
    }
  }

  function resetScratch() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESULT_KEY);

    window.location.reload();
  }

  function initializeGame() {
    generateTicketNumber();

    selectedPrize = chooseWeightedPrize();
    renderPrize();

    resizeCanvas();

    if (hasPlayedToday()) {
      loadCompletedState();
      return;
    }

    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("pointerleave", hideCoinCursor);

    window.addEventListener("pointerup", stopDrawing);
  }

  claimButton.addEventListener("click", claimPrize);
  resetButton.addEventListener("click", resetScratch);
  closeWinOverlay.addEventListener("click", closeOverlay);

  winOverlay.addEventListener("click", (event) => {
    if (event.target === winOverlay) {
      closeOverlay();
    }
  });

  window.addEventListener("resize", () => {
    if (!isRevealed && !hasPlayedToday()) {
      resizeCanvas();
    }
  });

  initializeGame();
})();