(() => {
  "use strict";

  /* =========================================================
     BYR Club — Sincronización de estado con el servidor
     ---------------------------------------------------------
     - Empuja el estado (puntos, XP, inventario…) a /api/state.php
       cuando cambia (con un pequeño retardo para no spamear).
     - Lo vuelve a empujar al salir de la página (por si quedó
       algo pendiente).
     - Al cargar, trae el estado del servidor para reflejar
       cambios hechos en otro dispositivo o cargas del admin.

     Solo actúa si hay sesión y si existen BYRUser/BYRStorage.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const STATE_URL = "/api/state.php";
  const ME_URL = "/api/me.php";

  let pushTimer = null;

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
     Empujar al servidor
  --------------------------------------------------------- */

  function push(useKeepalive) {
    if (!loggedIn()) return;
    const state = currentState();
    if (!state) return;

    fetch(STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: Boolean(useKeepalive),
      body: JSON.stringify({ state })
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
     Traer del servidor al cargar
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
  }

  /* ---------------------------------------------------------
     Enganches
  --------------------------------------------------------- */

  window.addEventListener("byr:user-change", schedulePush);

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
