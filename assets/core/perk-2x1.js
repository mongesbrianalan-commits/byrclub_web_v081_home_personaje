(() => {
  "use strict";

  /* =========================================================
     BYR Club — 2x1 de socio (miércoles)
     ---------------------------------------------------------
     Banner en el perfil que aparece SOLO los miércoles (lo decide
     el servidor, en hora de Argentina). El socio activa su cupón
     2x1, se genera un código validable por el admin y queda en
     "Mis cupones". Idempotente: activar de nuevo devuelve el mismo
     código del día.
  ========================================================= */

  const API_URL = "/api/perks/weekly-2x1.php";

  const banner = document.querySelector("[data-perk2x1]");
  if (!banner) return;

  const subEl = banner.querySelector("[data-perk2x1-sub]");
  const codeBox = banner.querySelector("[data-perk2x1-code]");
  const codeValue = banner.querySelector("[data-perk2x1-code-value]");
  const copyBtn = banner.querySelector("[data-perk2x1-copy]");
  const activateBtn = banner.querySelector("[data-perk2x1-activate]");

  function showCode(code) {
    codeValue.textContent = code;
    codeBox.hidden = false;
    activateBtn.hidden = true;
    subEl.textContent = "Mostralo en el local o pasá el código al pedir por delivery (Doble Cheese con papas 2x1). Queda en Mis cupones.";
  }

  async function load() {
    let data;
    try {
      const res = await fetch(API_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      data = await res.json();
    } catch (error) {
      return; // sin conexión / sin PHP: no mostramos el banner
    }

    if (!data || !data.isWednesday) {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;
    if (data.claimed && data.code) {
      showCode(data.code);
    } else {
      codeBox.hidden = true;
      activateBtn.hidden = false;
    }
  }

  async function activate() {
    activateBtn.disabled = true;
    activateBtn.textContent = "Activando…";
    let data;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin"
      });
      data = await res.json();
    } catch (error) {
      data = null;
    }

    if (data && data.code) {
      showCode(data.code);
      // Refrescamos "Mis cupones" para que el 2x1 aparezca ahí también.
      window.dispatchEvent(new CustomEvent("byr:user-updated"));
    } else {
      activateBtn.disabled = false;
      activateBtn.textContent = "Activar mi 2x1";
      subEl.textContent = (data && data.error)
        ? data.error
        : "No se pudo activar ahora. Probá recargar la página.";
    }
  }

  function copyCode() {
    const text = codeValue.textContent;
    const done = () => {
      copyBtn.textContent = "¡Copiado!";
      copyBtn.classList.add("copied");
      window.setTimeout(() => {
        copyBtn.textContent = "Copiar";
        copyBtn.classList.remove("copied");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  }

  activateBtn.addEventListener("click", activate);
  copyBtn.addEventListener("click", copyCode);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();
