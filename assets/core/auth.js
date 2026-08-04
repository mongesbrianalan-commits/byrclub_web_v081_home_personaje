(() => {
  "use strict";

  /* =========================================================
     BYRAuth — Sesión de usuario (conectado al backend PHP)
     ---------------------------------------------------------
     Ahora habla con la API en /api/ (registro, login, etc.).
     El servidor es la fuente de verdad (cookie de sesión).

     Mantenemos una "pista" liviana en localStorage
     (byrclub_session_v1) para que el header y el guard sepan
     de forma instantánea si hay sesión, sin esperar al server.
     La pista se setea al entrar y se borra al salir.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const API_BASE = "/api/";

  const AVATARS = ["🍔", "🍟", "🌭", "🧀", "🥤", "🔥", "👑", "⭐"];

  /* ---------------------------------------------------------
     Pista de sesión en localStorage
  --------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* almacenamiento bloqueado: seguimos igual */
    }
  }

  function getSession() {
    return readJSON(SESSION_KEY, null);
  }

  function isLoggedIn() {
    return Boolean(getSession());
  }

  function setSessionHint(user) {
    const hint = {
      email: user.email,
      name: user.name,
      avatar: user.avatar || "🍔",
      onboarded: Boolean(user.onboarded),
      loggedInAt: new Date().toISOString()
    };
    writeJSON(SESSION_KEY, hint);
    return hint;
  }

  /* Vuelca la respuesta del server: pista + estado de juego. */
  function applyUser(user) {
    setSessionHint(user);

    if (user.state && window.BYRStorage?.save) {
      window.BYRStorage.save(user.state);
    } else if (window.BYRStorage?.load && window.BYRStorage?.save) {
      /* Sin estado del server: al menos guardamos nombre/avatar. */
      try {
        const state = window.BYRStorage.load();
        state.profile = state.profile || {};
        state.profile.name = user.name;
        if (user.avatar) state.profile.avatar = user.avatar;
        state.profile.email = user.email;
        window.BYRStorage.save(state);
      } catch (error) {
        /* noop */
      }
    }

    window.dispatchEvent(new CustomEvent("byr:user-updated"));
    emit("login");
  }

  function emit(reason) {
    window.dispatchEvent(
      new CustomEvent("byr:auth-change", {
        detail: { reason, session: getSession() }
      })
    );
  }

  /* ---------------------------------------------------------
     Validaciones (rápidas, del lado del cliente; el server
     también valida)
  --------------------------------------------------------- */

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
  }

  function validateRegistration({ name, email, whatsapp, password }) {
    const errors = {};
    if (!String(name || "").trim()) errors.name = "Decinos cómo te llamás.";
    if (!isValidEmail(email)) errors.email = "Escribí un email válido.";
    if (!String(whatsapp || "").trim()) errors.whatsapp = "Necesitamos tu WhatsApp para avisarte de premios.";
    if (String(password || "").length < 6) errors.password = "La contraseña necesita al menos 6 caracteres.";
    return { ok: Object.keys(errors).length === 0, errors };
  }

  /* ---------------------------------------------------------
     Cliente HTTP de la API
  --------------------------------------------------------- */

  async function api(path, { method = "POST", body } = {}) {
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin"
      });
    } catch (error) {
      throw new AuthError(
        "No pudimos conectar con el servidor. Revisá tu conexión.",
        "network"
      );
    }

    let data = {};
    try {
      data = await res.json();
    } catch (error) {
      /* respuesta no-JSON */
    }

    if (!res.ok) {
      throw new AuthError(
        data.error || "Ocurrió un error. Probá de nuevo.",
        data.code || "error",
        data.errors || null
      );
    }

    return data;
  }

  /* =========================================================
     Acciones de sesión
  ========================================================= */

  async function register(data) {
    const validation = validateRegistration(data);
    if (!validation.ok) {
      throw new AuthError(
        Object.values(validation.errors)[0],
        "validation",
        validation.errors
      );
    }

    const { user } = await api("register.php", { body: data });
    applyUser(user);
    return getSession();
  }

  async function login({ email, password }) {
    const { user } = await api("login.php", { body: { email, password } });
    applyUser(user);
    return getSession();
  }

  async function logout() {
    try {
      await api("logout.php", {});
    } catch (error) {
      /* Aunque falle la red, limpiamos localmente. */
    }
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* noop */
    }
    emit("logout");
    return true;
  }

  async function completeOnboarding({ avatar, name, birthdate }) {
    const { user } = await api("onboarding.php", {
      body: { avatar, name, birthdate: birthdate || "" }
    });
    applyUser(user);
    return getSession();
  }

  /* ---------------------------------------------------------
     Error tipado
  --------------------------------------------------------- */

  class AuthError extends Error {
    constructor(message, code = "error", details = null) {
      super(message);
      this.name = "AuthError";
      this.code = code;
      this.details = details;
    }
  }

  /* ---------------------------------------------------------
     API pública (misma forma que antes)
  --------------------------------------------------------- */

  window.BYRAuth = {
    AVATARS,
    getSession,
    isLoggedIn,
    register,
    login,
    logout,
    completeOnboarding,
    isValidEmail,
    validateRegistration,
    AuthError
  };
})();
