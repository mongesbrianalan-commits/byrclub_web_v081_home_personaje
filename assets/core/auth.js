(() => {
  "use strict";

  /* =========================================================
     BYRAuth — Sesión de usuario (etapa: SOLO UI / LOCAL)
     ---------------------------------------------------------
     Este módulo maneja la "sesión" del usuario de BYR Club.

     IMPORTANTE (para el yo del futuro):
     Hoy TODO vive en el navegador (localStorage). No hay
     servidor todavía. Las contraseñas se guardan en texto
     plano SOLO para poder maquetar el flujo; esto NO es
     seguro y no debe usarse en producción.

     El día que conectemos un backend real (PHP+MySQL,
     Supabase, Firebase, etc.) solo hay que reescribir las
     funciones marcadas con  ⇩ BACKEND ⇩  para que hagan
     fetch() al servidor. Las pantallas (ingresar.html) NO
     necesitan cambiar, porque ya llaman a estas funciones
     con async/await.
  ========================================================= */

  const SESSION_KEY = "byrclub_session_v1";
  const ACCOUNTS_KEY = "byrclub_accounts_v1";

  /* Avatares disponibles en el onboarding. */
  const AVATARS = ["🍔", "🍟", "🌭", "🧀", "🥤", "🔥", "👑", "⭐"];

  /* ---------------------------------------------------------
     Utilidades de almacenamiento local
  --------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("BYRAuth: no se pudo leer", key, error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("BYRAuth: no se pudo guardar", key, error);
      return false;
    }
  }

  function getAccounts() {
    const accounts = readJSON(ACCOUNTS_KEY, []);
    return Array.isArray(accounts) ? accounts : [];
  }

  function saveAccounts(accounts) {
    writeJSON(ACCOUNTS_KEY, accounts);
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /* Simula la latencia de una llamada al servidor, así la UI
     ya muestra sus estados de carga desde ahora. */
  function delay(ms = 450) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ---------------------------------------------------------
     Validaciones (se reutilizan en las pantallas)
  --------------------------------------------------------- */

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  function validateRegistration({ name, email, whatsapp, password }) {
    const errors = {};

    if (!String(name || "").trim()) {
      errors.name = "Decinos cómo te llamás.";
    }

    if (!isValidEmail(email)) {
      errors.email = "Escribí un email válido.";
    }

    if (!String(whatsapp || "").trim()) {
      errors.whatsapp = "Necesitamos tu WhatsApp para avisarte de premios.";
    }

    if (String(password || "").length < 6) {
      errors.password = "La contraseña necesita al menos 6 caracteres.";
    }

    return {
      ok: Object.keys(errors).length === 0,
      errors
    };
  }

  /* ---------------------------------------------------------
     Sesión
  --------------------------------------------------------- */

  function getSession() {
    return readJSON(SESSION_KEY, null);
  }

  function isLoggedIn() {
    return Boolean(getSession());
  }

  function setSession(account) {
    const session = {
      email: account.email,
      name: account.name,
      avatar: account.avatar || "🍔",
      onboarded: Boolean(account.onboarded),
      loggedInAt: new Date().toISOString()
    };

    writeJSON(SESSION_KEY, session);
    syncUserProfile(session);
    emit("login");
    return session;
  }

  /* Vuelca los datos de la cuenta al estado de juego (BYRUser),
     que es lo que leen el perfil, el header y el HUD. */
  function syncUserProfile(session) {
    if (window.BYRUser?.setName && session.name) {
      window.BYRUser.setName(session.name);
    }

    /* Guardamos el avatar directo en el estado, por si el
       BYRUser todavía no expone un setter dedicado. */
    if (window.BYRStorage?.load && window.BYRStorage?.save) {
      try {
        const state = window.BYRStorage.load();
        state.profile = state.profile || {};
        if (session.avatar) {
          state.profile.avatar = session.avatar;
        }
        state.profile.email = session.email;
        window.BYRStorage.save(state);
      } catch (error) {
        console.warn("BYRAuth: no se pudo sincronizar el avatar.", error);
      }
    }

    window.dispatchEvent(new CustomEvent("byr:user-updated"));
  }

  function emit(reason) {
    window.dispatchEvent(
      new CustomEvent("byr:auth-change", {
        detail: { reason, session: getSession() }
      })
    );
  }

  /* =========================================================
     ⇩ BACKEND ⇩
     Estas 3 funciones son las que hay que reescribir el día
     que exista un servidor. Hoy simulan todo en localStorage.
  ========================================================= */

  /* register(): crea la cuenta. */
  async function register(data) {
    await delay();

    const validation = validateRegistration(data);
    if (!validation.ok) {
      const message = Object.values(validation.errors)[0];
      throw new AuthError(message, "validation", validation.errors);
    }

    const email = normalizeEmail(data.email);
    const accounts = getAccounts();

    if (accounts.some((acc) => acc.email === email)) {
      throw new AuthError(
        "Ya existe una cuenta con ese email. Probá ingresar.",
        "email-taken"
      );
    }

    const account = {
      email,
      name: String(data.name).trim(),
      whatsapp: String(data.whatsapp).trim(),
      /* OJO: texto plano solo para la maqueta. En el backend
         real esto se hashea del lado del servidor. */
      password: String(data.password),
      avatar: null,
      onboarded: false,
      createdAt: new Date().toISOString()
    };

    accounts.push(account);
    saveAccounts(accounts);

    /* Deja la sesión iniciada pero SIN onboarding completo,
       para que ingresar.html lleve al paso de personaje. */
    return setSession(account);
  }

  /* login(): valida credenciales. */
  async function login({ email, password }) {
    await delay();

    const normalizedEmail = normalizeEmail(email);
    const accounts = getAccounts();
    const account = accounts.find((acc) => acc.email === normalizedEmail);

    if (!account || account.password !== String(password)) {
      throw new AuthError(
        "Email o contraseña incorrectos.",
        "invalid-credentials"
      );
    }

    return setSession(account);
  }

  /* logout(): cierra la sesión (no borra la cuenta). */
  async function logout() {
    localStorage.removeItem(SESSION_KEY);
    emit("logout");
    return true;
  }

  /* completeOnboarding(): guarda avatar/nombre elegidos. */
  async function completeOnboarding({ avatar, name }) {
    await delay(300);

    const session = getSession();
    if (!session) {
      throw new AuthError("No hay una sesión activa.", "no-session");
    }

    const accounts = getAccounts();
    const account = accounts.find((acc) => acc.email === session.email);

    const cleanName = String(name || session.name).trim();
    const chosenAvatar = avatar || session.avatar || "🍔";

    if (account) {
      account.name = cleanName;
      account.avatar = chosenAvatar;
      account.onboarded = true;
      saveAccounts(accounts);
    }

    const updated = {
      ...session,
      name: cleanName,
      avatar: chosenAvatar,
      onboarded: true
    };

    writeJSON(SESSION_KEY, updated);
    syncUserProfile(updated);
    emit("onboarding-complete");
    return updated;
  }

  /* =========================================================
     Error tipado, para que las pantallas puedan diferenciar
     un problema de validación de uno de credenciales.
  ========================================================= */

  class AuthError extends Error {
    constructor(message, code = "error", details = null) {
      super(message);
      this.name = "AuthError";
      this.code = code;
      this.details = details;
    }
  }

  /* ---------------------------------------------------------
     API pública
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
