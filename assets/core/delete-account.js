(() => {
  "use strict";

  /* =========================================================
     Borrar mi cuenta (lo piden App Store y Google Play).
     Dos pasos a propósito: primero se abre el formulario, después
     contraseña + tilde de "entiendo". Recién ahí se borra.
  ========================================================= */

  const section = document.querySelector("[data-delete-account]");
  if (!section) return;

  const openBtn = section.querySelector("[data-da-open]");
  const form = section.querySelector("[data-da-form]");
  const passInput = section.querySelector("[data-da-password]");
  const confirmCheck = section.querySelector("[data-da-confirm]");
  const submitBtn = section.querySelector("[data-da-submit]");
  const cancelBtn = section.querySelector("[data-da-cancel]");
  const status = section.querySelector("[data-da-status]");

  function setStatus(message, type) {
    status.textContent = message || "";
    status.className = "auth-form-status" + (type ? ` is-${type}` : "");
  }

  openBtn.addEventListener("click", () => {
    openBtn.hidden = true;
    form.hidden = false;
    passInput.focus();
  });

  cancelBtn.addEventListener("click", () => {
    form.reset();
    setStatus("", "");
    form.hidden = true;
    openBtn.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = String(passInput.value || "");
    if (!password) {
      setStatus("Escribí tu contraseña para confirmar.", "error");
      passInput.focus();
      return;
    }
    if (!confirmCheck.checked) {
      setStatus("Tildá que entendés que se pierde todo.", "error");
      return;
    }

    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Borrando…";
    setStatus("", "");

    try {
      const res = await fetch("/api/delete-account.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });
      let data = {};
      try {
        data = await res.json();
      } catch (error) {
        /* respuesta no-JSON */
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo borrar la cuenta.");
      }

      /* Limpiamos lo que el club guardó en este dispositivo. */
      try {
        Object.keys(localStorage)
          .filter((k) => k.indexOf("byrclub_") === 0)
          .forEach((k) => localStorage.removeItem(k));
      } catch (error) {
        /* noop */
      }
      setStatus("Tu cuenta fue borrada. ¡Gracias por haber sido parte de BYR Club!", "ok");
      window.setTimeout(() => { window.location.href = "index.html"; }, 2200);
    } catch (error) {
      setStatus(error.message, "error");
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();
