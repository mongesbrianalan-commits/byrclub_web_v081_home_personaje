(() => {
  "use strict";

  /* El límite diario y el sorteo ya no viven acá (ver el bloque grande de
     abajo). Estas dos claves quedaron de la versión vieja: las borramos
     una vez para no dejar basura en el navegador de nadie. */
  try {
    localStorage.removeItem("byr-scratch-last-play");
    localStorage.removeItem("byr-scratch-result");
  } catch (error) {
    /* modo privado sin storage: da igual */
  }

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
  const winCode = document.getElementById("scratchWinCode");
  const winCodeValue = document.getElementById("scratchWinCodeValue");
  const winCodeCopy = document.getElementById("scratchWinCodeCopy");
  const confetti = document.getElementById("confetti");

  /* ------------------------------------------------------------------
     El premio lo decide el SERVIDOR (api/scratch/play.php).

     Antes el catálogo y el sorteo vivían acá, en el navegador, y la marca
     de "ya jugué hoy" se escribía recién al reclamar. Resultado: raspar y
     refrescar sorteaba un cartón nuevo, así que refrescando hasta que
     saliera el premio deseado la raspadita dejaba de ser un sorteo. Y aun
     reclamando, el límite era localStorage: borrando los datos del
     navegador se volvían a cobrar los puntos.

     Ahora el navegador no elige nada: pide el cartón y lo dibuja.
     ------------------------------------------------------------------ */
  const STATUS_URL = "/api/scratch/status.php";
  const PLAY_URL = "/api/scratch/play.php";

  let selectedPrize = null;
  let isDrawing = false;
  let isRevealed = false;
  let isClaimed = false;
  let isBlocked = false;
  let lastPoint = null;
  let progressCheckTimer = null;
  let lastScratchSoundAt = 0;

  /* Petición del cartón de hoy: se dispara UNA vez, en el primer raspón. */
  let playRequest = null;

  /* Nivel del socio, para saber si la acreditación lo hizo subir. */
  let currentLevel = 1;
  let leveledUp = false;

  /* Le pregunta al servidor si la raspadita de hoy sigue disponible, y si
     ya se jugó, cuál fue el premio (para repintarlo con su código).
     Devuelve null si no se pudo averiguar (sin conexión). */
  async function fetchDailyStatus() {
    try {
      const res = await fetch(STATUS_URL, { credentials: "same-origin" });
      const data = await res.json();

      if (data && typeof data.playedToday === "boolean") {
        return data;
      }
    } catch (error) {
      /* sin conexión */
    }

    return null;
  }

  /* Pide el cartón: el servidor sortea, marca el día y acredita puntos/XP
     (y emite el vale si el premio se retira en el local). */
  async function requestCard() {
    const res = await fetch(PLAY_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const data = await res.json();

    if (!res.ok) {
      const error = new Error(
        (data && data.error) || "No pudimos preparar tu raspadita."
      );
      error.code = data && data.code;
      throw error;
    }

    return data;
  }

  /* Arranca la petición del cartón una sola vez. El cartón sigue tapado
     mientras tanto, así que la espera de red no se ve. */
  function ensureCard() {
    if (playRequest) {
      return playRequest;
    }

    playRequest = requestCard()
      .then((data) => {
        selectedPrize = data.prize;
        renderPrize();
        applyServerState(data.state);

        /* La raspadita ya cuenta como jugada: el servidor acreditó. No
           esperamos al botón de festejo para registrar logros y misiones.
           (`reused` = reintento sobre el mismo cartón, no se cuenta dos veces.) */
        if (!data.reused) {
          if (window.BYRMissionEngine?.track) {
            BYRMissionEngine.track("scratch");
            BYRMissionEngine.track("game");
          }

          if (window.BYRAchievementEngine?.track) {
            BYRAchievementEngine.track("scratch");
          }
        }

        return data;
      })
      .catch((error) => {
        playRequest = null; /* deja reintentar en el próximo raspón */
        throw error;
      });

    return playRequest;
  }

  function readLevel() {
    return window.BYRUser?.getProgression
      ? Number(BYRUser.getProgression()?.level) || 1
      : 1;
  }

  /* El servidor ya sumó puntos y XP: acá solo nos ponemos al día con el
     estado que devolvió (no volvemos a sumar nada del lado del cliente). */
  function applyServerState(state) {
    if (!state) {
      return;
    }

    const previousLevel = readLevel();

    if (window.BYRUser?.replaceState) {
      BYRUser.replaceState(state);
    } else if (window.BYRStorage?.save) {
      window.BYRStorage.save(state);
    }

    window.dispatchEvent(new CustomEvent("byr:user-updated"));

    if (window.BYRAppShell?.sync) {
      BYRAppShell.sync();
    }

    currentLevel = readLevel();
    leveledUp = currentLevel > previousLevel;

    if (window.BYRHUD?.sync) {
      BYRHUD.sync({ duration: 950 });
    }
  }

  /* No se pudo pedir el cartón: sin red, o el socio ya jugó desde otro
     navegador o celular. En los dos casos hay que frenar el raspado. */
  function handleCardError(error) {
    if (error && error.code === "already-played") {
      blockScratching(
        "Ya jugaste hoy. Mañana vas a tener una nueva oportunidad."
      );
      return;
    }

    blockScratching(
      (error && error.message) ||
        "No pudimos preparar tu raspadita. Actualizá la página."
    );
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
    if (isRevealed || isBlocked) {
      return;
    }

    /* Primer raspón: acá el servidor sortea el premio, marca el día y
       acredita. En los raspones siguientes ensureCard() no pide nada más. */
    ensureCard().catch(handleCardError);

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

const now = performance.now();

if (
  window.BYRAudio &&
  now - lastScratchSoundAt > 55
) {
  BYRAudio.scratch();
  lastScratchSoundAt = now;
}

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
    if (isRevealed || isBlocked) {
      return;
    }

    /* El premio lo decide el servidor. Si todavía no contestó, esperamos:
       no podemos destapar un cartón vacío. */
    if (!selectedPrize) {
      progressTitle.textContent = "¡Ya falta poco!";
      statusText.textContent = "Descubriendo tu premio…";

      ensureCard()
        .then(revealPrize)
        .catch(handleCardError);

      return;
    }

    isRevealed = true;
    isDrawing = false;

    canvas.style.transition = "opacity 420ms ease";
    canvas.style.opacity = "0";

    coinCursor.classList.remove("is-visible");
    scratchHint.classList.add("is-hidden");
    scratchTicket.classList.add("is-revealed");
    if (window.BYRAudio) {
  BYRAudio.reveal();
}
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
    statusText.textContent = "¡Lo encontraste! Tocá para ver tu premio.";
  }

  /* El premio ya lo sorteó y acreditó el servidor en el primer raspón, así
     que este botón no otorga nada: es el festejo. Abre el overlay con el
     premio y, si se retira en el local, con su código.

     Se puede tocar más de una vez (sirve para volver a ver el código del
     día); el festejo con confeti y las partículas salen solo la primera. */
  function claimPrize() {
    if (!isRevealed || !selectedPrize) {
      return;
    }

    const firstTime = !isClaimed;
    isClaimed = true;

    if (firstTime) {
      if (window.BYREffects) {
        BYREffects.prize(selectedPrize);

        if (selectedPrize.points) {
          BYREffects.points(selectedPrize.points, {
            x: window.innerWidth / 2,
            y: window.innerHeight * 0.68
          });
        }

        if (selectedPrize.xp) {
          window.setTimeout(() => {
            BYREffects.xp(selectedPrize.xp, {
              x: window.innerWidth / 2,
              y: window.innerHeight * 0.72
            });
          }, 350);
        }
      }

      if (leveledUp) {
        window.setTimeout(() => {
          if (window.BYRHUD) {
            BYRHUD.updateLevel(currentLevel);
          }

          if (window.BYREffects) {
            BYREffects.levelUp(currentLevel);
          }
        }, 900);
      }
    }

    claimButton.textContent = selectedPrize.code
      ? "Ver mi código"
      : "Ver mi premio";

    statusText.textContent =
      "Tu premio ya está guardado en tu perfil de BYR Club.";

    showWinOverlay(selectedPrize.code);
  }

  function showWinOverlay(code) {
    winPrizeIcon.textContent = selectedPrize.icon;
    winPrizeTitle.textContent = selectedPrize.label;

    /* El código sale solo para los premios que se retiran en el local.
       Quién es canjeable lo dice el servidor, no una lista del navegador. */
    if (winCode) {
      if (selectedPrize.redeemable && code) {
        winCodeValue.textContent = code;
        winCode.hidden = false;
      } else {
        winCode.hidden = true;
      }
    }

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

  /* Repinta el cartón de hoy ya revelado, con el premio que dice el
     SERVIDOR. Se usa cuando el socio vuelve a entrar después de haber
     jugado: refrescar la página no reparte un cartón nuevo. */
  function loadCompletedState(prize) {
    if (!prize) {
      return;
    }

    selectedPrize = prize;
    renderPrize();

    isRevealed = true;
    isClaimed = true;

    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";

    scratchHint.classList.add("is-hidden");
    scratchTicket.classList.add("is-revealed");

    progressBar.style.width = "100%";
    progressText.textContent = "100% revelado";
    progressTitle.textContent = "Premio de hoy";

    claimButton.disabled = false;
    claimButton.textContent = prize.code ? "Ver mi código" : "Ver mi premio";

    statusText.textContent =
      "Ya jugaste hoy. Mañana vas a tener una nueva oportunidad.";
  }

  /* Frena el raspado y explica por qué. */
  function blockScratching(message) {
    isBlocked = true;
    isDrawing = false;

    canvas.style.pointerEvents = "none";
    coinCursor.classList.remove("is-visible");
    scratchHint.classList.add("is-hidden");

    claimButton.disabled = true;
    statusText.textContent = message;
  }

  /* Botón oculto de prueba: recarga la página. El límite diario lo pone
     ahora el servidor, así que esto ya no habilita otra raspadita. */
  function resetScratch() {
    window.location.reload();
  }

  async function initializeGame() {
    generateTicketNumber();
    resizeCanvas();

    /* El cartón arranca tapado y sin premio: quién gana qué lo decide el
       servidor en el primer raspón. */
    canvas.style.pointerEvents = "none";
    statusText.textContent = "Preparando tu raspadita…";

    const status = await fetchDailyStatus();

    if (!status) {
      blockScratching(
        "Sin conexión: no pudimos preparar tu raspadita. Actualizá la página."
      );
      return;
    }

    if (status.ready === false) {
      /* Falta correr la migración del límite diario: mejor avisar antes
         que dejar raspar un cartón que no se va a poder acreditar. */
      blockScratching(
        "La raspadita vuelve en un rato. Mientras tanto, probá la ruleta o el memotest."
      );
      return;
    }

    if (status.playedToday) {
      if (status.prize) {
        loadCompletedState(status.prize);
      } else {
        blockScratching(
          "Ya jugaste hoy. Mañana vas a tener una nueva oportunidad."
        );
      }

      return;
    }

    currentLevel = readLevel();

    canvas.style.pointerEvents = "";

    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("pointerleave", hideCoinCursor);

    window.addEventListener("pointerup", stopDrawing);

    statusText.textContent = "Raspá el cartón para descubrir tu premio del día.";
  }

  claimButton.addEventListener("click", claimPrize);
  resetButton.addEventListener("click", resetScratch);
  closeWinOverlay.addEventListener("click", closeOverlay);

  if (winCodeCopy) {
    winCodeCopy.addEventListener("click", () => {
      const code = winCodeValue.textContent;
      const done = () => {
        winCodeCopy.textContent = "¡Copiado!";
        winCodeCopy.classList.add("copied");
        window.setTimeout(() => {
          winCodeCopy.textContent = "Copiar";
          winCodeCopy.classList.remove("copied");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(done);
      } else {
        done();
      }
    });
  }

  winOverlay.addEventListener("click", (event) => {
    if (event.target === winOverlay) {
      closeOverlay();
    }
  });

  window.addEventListener("resize", () => {
    if (!isRevealed) {
      resizeCanvas();
    }
  });

  initializeGame();
})();
