(() => {
  "use strict";

  /* =========================================================
     Controlador de ingresar.html
     Conecta los formularios con BYRAuth y maneja el paso a
     paso: acceso -> (registro) -> onboarding -> perfil.
  ========================================================= */

  if (!window.BYRAuth) {
    console.error("BYRAuth no está disponible. Revisá el orden de los scripts.");
    return;
  }

  const REDIRECT_AFTER_LOGIN = "perfil.html";

  /* Si llegamos desde una página protegida (auth-guard.js), volvemos
     a ella después de entrar. Solo aceptamos rutas internas del mismo
     sitio para evitar redirecciones abiertas. */
  function getSafeNext() {
    try {
      const next = new URLSearchParams(location.search).get("next");
      if (!next) return null;
      if (next.charAt(0) !== "/" || next.charAt(1) === "/") return null;
      return next;
    } catch (error) {
      return null;
    }
  }

  const destination = getSafeNext() || REDIRECT_AFTER_LOGIN;

  const views = {
    access: document.querySelector('[data-view="access"]'),
    onboarding: document.querySelector('[data-view="onboarding"]')
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el?.classList.toggle("is-active", key === name);
    });
  }

  /* Si ya hay sesión, no tiene sentido mostrar el login. */
  const existingSession = window.BYRAuth.getSession();
  if (existingSession) {
    if (existingSession.onboarded) {
      window.location.replace(destination);
      return;
    }
    /* Sesión creada pero sin personaje elegido: al onboarding. */
    startOnboarding(existingSession);
  }

  /* ---------------------------------------------------------
     Alternar entre Ingresar y Crear cuenta
  --------------------------------------------------------- */

  const tabButtons = document.querySelectorAll(".auth-switch [data-tab]");
  const panels = {
    login: document.querySelector('[data-panel="login"]'),
    register: document.querySelector('[data-panel="register"]')
  };

  function selectTab(name) {
    tabButtons.forEach((btn) =>
      btn.classList.toggle("is-active", btn.dataset.tab === name)
    );
    Object.entries(panels).forEach(([key, panel]) => {
      const isActive = key === name;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });
    clearMessages(panels[name]);
    panels[name].querySelector("input")?.focus();
  }

  tabButtons.forEach((btn) =>
    btn.addEventListener("click", () => selectTab(btn.dataset.tab))
  );

  document.querySelectorAll("[data-goto]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      selectTab(link.dataset.goto);
    })
  );

  /* ---------------------------------------------------------
     Helpers de UI (errores y estados)
  --------------------------------------------------------- */

  function clearMessages(form) {
    if (!form) return;
    form.querySelectorAll("[data-error]").forEach((el) => (el.textContent = ""));
    form
      .querySelectorAll(".auth-field")
      .forEach((f) => f.classList.remove("has-error"));
    const status = form.querySelector(".auth-form-status");
    if (status) {
      status.textContent = "";
      status.className = "auth-form-status";
    }
  }

  function showFieldErrors(form, errors) {
    Object.entries(errors || {}).forEach(([field, message]) => {
      const errorEl = form.querySelector(`[data-error="${field}"]`);
      const input = form.querySelector(`[name="${field}"]`);
      if (errorEl) errorEl.textContent = message;
      input?.closest(".auth-field")?.classList.add("has-error");
    });
  }

  function setStatus(form, message, type = "error") {
    const status = form.querySelector(".auth-form-status");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-form-status is-${type}`;
  }

  function setLoading(button, isLoading, loadingLabel = "Un segundo…") {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = loadingLabel;
      button.disabled = true;
    } else {
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      button.disabled = false;
    }
  }

  /* ---------------------------------------------------------
     Login
  --------------------------------------------------------- */

  panels.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages(panels.login);

    const data = Object.fromEntries(new FormData(panels.login).entries());
    const button = panels.login.querySelector(".auth-submit");

    setLoading(button, true);
    try {
      const session = await window.BYRAuth.login(data);
      if (session && session.onboarded === false) {
        /* Se registró pero no eligió personaje: lo mandamos a terminar. */
        startOnboarding(session);
      } else {
        setStatus(panels.login, "¡Listo! Entrando…", "ok");
        goAfterLogin(session);
      }
    } catch (error) {
      setStatus(panels.login, error.message || "No pudimos ingresarte.");
    } finally {
      setLoading(button, false);
    }
  });

  /* ---------------------------------------------------------
     Registro
  --------------------------------------------------------- */

  panels.register.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages(panels.register);

    const data = Object.fromEntries(new FormData(panels.register).entries());
    const button = panels.register.querySelector(".auth-submit");

    setLoading(button, true);
    try {
      const session = await window.BYRAuth.register(data);
      startOnboarding(session);
    } catch (error) {
      if (error.code === "validation") {
        showFieldErrors(panels.register, error.details);
      }
      setStatus(panels.register, error.message || "No pudimos crear la cuenta.");
    } finally {
      setLoading(button, false);
    }
  });

  /* ---------------------------------------------------------
     Onboarding: elegir personaje
  --------------------------------------------------------- */

  const avatarGrid = document.querySelector("[data-avatar-grid]");
  const avatarPreview = document.querySelector("[data-avatar-preview]");
  const onboardingNameInput = document.querySelector("[data-onboarding-name]");
  const finishButton = document.querySelector("[data-onboarding-finish]");

  let selectedAvatar = window.BYRAuth.AVATARS[0];

  function renderAvatars() {
    avatarGrid.innerHTML = "";
    window.BYRAuth.AVATARS.forEach((avatar, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = avatar;
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", `Avatar ${avatar}`);
      if (index === 0) button.classList.add("is-selected");
      button.addEventListener("click", () => selectAvatar(avatar, button));
      avatarGrid.appendChild(button);
    });
  }

  function selectAvatar(avatar, button) {
    selectedAvatar = avatar;
    avatarGrid
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("is-selected", b === button));
    avatarPreview.textContent = avatar;
    avatarPreview.classList.remove("pop");
    void avatarPreview.offsetWidth;
    avatarPreview.classList.add("pop");
  }

  function startOnboarding(session) {
    renderAvatars();
    selectedAvatar = session?.avatar || window.BYRAuth.AVATARS[0];
    avatarPreview.textContent = selectedAvatar;
    onboardingNameInput.value = session?.name || "";
    showView("onboarding");
    onboardingNameInput.focus();
  }

  finishButton?.addEventListener("click", async () => {
    const status = document.querySelector("[data-onboarding-status]");
    status.textContent = "";
    status.className = "auth-form-status";

    setLoading(finishButton, true, "Preparando todo…");
    try {
      const session = await window.BYRAuth.completeOnboarding({
        avatar: selectedAvatar,
        name: onboardingNameInput.value
      });
      status.textContent = "¡Bienvenido al club! 🎉";
      status.className = "auth-form-status is-ok";
      goAfterLogin(session);
    } catch (error) {
      status.textContent = error.message || "Algo salió mal.";
      status.className = "auth-form-status is-error";
      setLoading(finishButton, false);
    }
  });

  /* ---------------------------------------------------------
     Redirección final
  --------------------------------------------------------- */

  function goAfterLogin(session) {
    const target =
      session && session.onboarded === false
        ? null
        : destination;

    if (target) {
      window.setTimeout(() => window.location.assign(target), 500);
    }
  }
})();
