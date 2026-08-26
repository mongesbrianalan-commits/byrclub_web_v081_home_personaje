(() => {
  "use strict";

  /* =========================================================
     BYR Club — Sincronización con el servidor
     ---------------------------------------------------------
     El estado (puntos, XP, inventario, logros) es del SERVIDOR.
     Este módulo hace tres cosas:

       1. Al cargar la página, le pide a /api/progress/sync.php
          que marque la visita del día, recalcule logros y
          misiones, y devuelva el estado al día.
       2. Publica ese progreso en window.BYRProgress, que es de
          donde leen achievement-engine.js y mission-engine.js.
       3. Empuja el nombre y el avatar si el socio los cambia.
          Es lo ÚNICO que el servidor le acepta al navegador:
          antes se empujaba el estado entero, y por ahí se podían
          acreditar puntos sin jugar a nada.

     Solo actúa si hay sesión.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const STATE_URL = "/api/state.php";
  const SYNC_URL = "/api/progress/sync.php";
  const ME_URL = "/api/me.php";

  let pushTimer = null;

  /* Último progreso que devolvió el servidor. */
  let progress = { achievements: [], missions: [], metrics: {} };
  let ready = false;
  let inFlight = null;

  function loggedIn() {
    try {
      return Boolean(localStorage.getItem(SESSION_KEY));
    } catch (error) {
      return false;
    }
  }

  function currentState() {
    try {
      return window.BYRUser?.getState ? window.BYRUser.getState() : null;
    } catch (error) {
      return null;
    }
  }

  /* ---------------------------------------------------------
     Empujar (solo perfil)
  --------------------------------------------------------- */

  function push(useKeepalive) {
    if (!loggedIn()) return;
    const state = currentState();
    if (!state) return;

    /* Mandamos solo el perfil. El servidor ignora todo lo demás,
       pero no tiene sentido subir un estado entero que va a
       descartar. */
    fetch(STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: Boolean(useKeepalive),
      body: JSON.stringify({ state: { profile: state.profile } })
    }).catch(() => {
      /* si falla, se reintenta en el próximo cambio */
    });
  }

  function schedulePush() {
    if (!loggedIn()) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => push(false), 800);
  }

  function flushPush() {
    if (pushTimer) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
    push(true);
  }

  /* ---------------------------------------------------------
     Progreso: logros, misiones y racha
  --------------------------------------------------------- */

  /* Avisa de lo que se acaba de desbloquear, para que salte el
     cartelito. Los textos y los iconos salen de los catálogos del
     navegador; qué se desbloqueó lo decide el servidor. */
  function announce(unlocked, completed) {
    let delay = 0;

    (unlocked || []).forEach((id) => {
      const achievement = window.BYRAchievementRegistry?.getById?.(id);
      if (!achievement) return;

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("byr:achievement-unlocked", {
            detail: {
              achievement,
              record: {
                id,
                progress: achievement.target,
                unlocked: true,
                unlockedAt: new Date().toISOString(),
                rewardGranted: true
              },
              reward: achievement.reward
            }
          })
        );
      }, delay);

      delay += 420;
    });

    (completed || []).forEach((id) => {
      const mission = window.BYRMissionRegistry?.getById?.(id);
      if (!mission) return;

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("byr:mission-completed", {
            detail: {
              mission,
              record: {
                id,
                progress: mission.target,
                completed: true,
                completedAt: new Date().toISOString(),
                rewardGranted: true
              },
              reward: mission.reward
            }
          })
        );
      }, delay);

      delay += 420;
    });
  }

  /* Guarda el estado y el progreso que devolvió el servidor.
     `data` puede venir de sync.php, de un juego o del canje: todos
     devuelven la misma forma. */
  function apply(data) {
    if (!data) return null;

    if (data.state && window.BYRUser?.replaceState) {
      window.BYRUser.replaceState(data.state);
    } else if (data.state && window.BYRStorage?.save) {
      window.BYRStorage.save(data.state);
    }

    if (Array.isArray(data.achievements) || Array.isArray(data.missions)) {
      progress = {
        achievements: data.achievements || [],
        missions: data.missions || [],
        metrics: data.metrics || {}
      };
      ready = true;
    }

    window.dispatchEvent(new CustomEvent("byr:user-updated"));
    window.dispatchEvent(
      new CustomEvent("byr:progress", { detail: progress })
    );

    if (window.BYRAppShell?.sync) window.BYRAppShell.sync();

    announce(data.unlocked, data.completed);

    return data;
  }

  /* Le pregunta al servidor por el progreso. Es idempotente: solo
     acredita lo que todavía no estaba acreditado, así que se puede
     llamar cuantas veces haga falta. */
  function refresh() {
    if (!loggedIn()) return Promise.resolve(null);
    if (inFlight) return inFlight;

    inFlight = fetch(SYNC_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => apply(data))
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  window.BYRProgress = {
    get: () => progress,
    isReady: () => ready,
    refresh,

    /* Para las respuestas que ya traen estado y novedades: los
       juegos y el canje de recompensas. */
    apply
  };

  /* ---------------------------------------------------------
     Al cargar
  --------------------------------------------------------- */

  async function pullOnLoad() {
    if (!loggedIn()) return;

    let data;
    try {
      const res = await fetch(ME_URL, { credentials: "same-origin" });
      data = await res.json();
    } catch (error) {
      return; /* sin conexión: seguimos con la copia local */
    }

    if (!data.user) {
      /* El servidor dice que no hay sesión: limpiamos la pista. */
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (error) {
        /* noop */
      }
      window.dispatchEvent(new CustomEvent("byr:auth-change", {
        detail: { reason: "logout", session: null }
      }));
      return;
    }

    if (data.user.state && window.BYRStorage?.save) {
      window.BYRStorage.save(data.user.state);
      window.dispatchEvent(new CustomEvent("byr:user-updated"));
      if (window.BYRAppShell?.sync) window.BYRAppShell.sync();
    }

    /* Y ahora la visita del día, los logros y las misiones. */
    refresh();
  }

  /* ---------------------------------------------------------
     Enganches
  --------------------------------------------------------- */

  window.addEventListener("byr:user-change", (event) => {
    /* Solo empujamos si cambió el perfil. Los cambios que vienen del
       servidor no se le devuelven al servidor. */
    if (event?.detail?.reason === "profile-updated") {
      schedulePush();
    }
  });

  window.addEventListener("pagehide", flushPush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushPush();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pullOnLoad, { once: true });
  } else {
    pullOnLoad();
  }
})();
