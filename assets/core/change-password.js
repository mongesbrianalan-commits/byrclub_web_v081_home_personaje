(() => {
  "use strict";

  /* =========================================================
     Cambiar contraseña desde el perfil.
     Verifica la actual en el servidor y guarda la nueva.
  ========================================================= */

  const form = document.querySelector("[data-change-pass-form]");
  if (!form) return;

  const currentInput = form.querySelector("[data-cp-current]");
  const newInput = form.querySelector("[data-cp-new]");
  const repeatInput = form.querySelector("[data-cp-repeat]");
  const showCheck = form.querySelector("[data-cp-show]");
  const submitBtn = form.querySelector("[data-cp-submit]");
  const status = form.querySelector("[data-cp-status]");

  function setStatus(message, type) {
    status.textContent = message || "";
    status.className = "auth-form-status" + (type ? ` is-${type}` : "");
  }

  if (showCheck) {
    showCheck.addEventListener("change", () => {
      const kind = showCheck.checked ? "text" : "password";
      currentInput.type = kind;
      newInput.type = kind;
      repeatInput.type = kind;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const current = String(currentInput.value || "");
    const next = String(newInput.value || "");
    const repeat = String(repeatInput.value || "");

    if (!current) {
      setStatus("Escribí tu contraseña actual.", "error");
      currentInput.focus();
      return;
    }
    if (next.length < 6) {
      setStatus("La nueva contraseña necesita al menos 6 caracteres.", "error");
      newInput.focus();
      return;
    }
    if (next !== repeat) {
      setStatus("Las dos contraseñas nuevas no coinciden.", "error");
      repeatInput.focus();
      return;
    }
    if (next === current) {
      setStatus("La nueva contraseña tiene que ser distinta a la actual.", "error");
      newInput.focus();
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Guardando…";
    setStatus("", "");

    try {
      const res = await fetch("/api/change-password.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      let data = {};
      try {
        data = await res.json();
      } catch (error) {
        /* respuesta no-JSON */
      }
      if (!res.ok) {
        throw new Error(data.error || "No se pudo cambiar la contraseña.");
      }
      setStatus("✅ Listo, tu contraseña quedó actualizada.", "ok");
      form.reset();
      if (showCheck) showCheck.checked = false;
      currentInput.type = newInput.type = repeatInput.type = "password";
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();
