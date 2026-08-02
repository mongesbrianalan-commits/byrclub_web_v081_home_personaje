(() => {
  "use strict";

  /* =========================================================
     Panel de administración — cargar puntos a clientes.
     Solo funciona para usuarios con is_admin = 1 (validado
     también del lado del servidor en cada llamada).
  ========================================================= */

  const API = "/api/";

  const gate = document.querySelector("[data-admin-gate]");
  const panel = document.querySelector("[data-admin-panel]");

  const emailInput = document.querySelector("[data-find-email]");
  const findBtn = document.querySelector("[data-find-btn]");
  const findStatus = document.querySelector("[data-find-status]");

  const foundCard = document.querySelector("[data-found-card]");
  const foundAvatar = document.querySelector("[data-found-avatar]");
  const foundName = document.querySelector("[data-found-name]");
  const foundPoints = document.querySelector("[data-found-points]");
  const foundXp = document.querySelector("[data-found-xp]");

  const awardSection = document.querySelector("[data-award-section]");
  const pointsInput = document.querySelector("[data-award-points]");
  const xpInput = document.querySelector("[data-award-xp]");
  const reasonInput = document.querySelector("[data-award-reason]");
  const awardBtn = document.querySelector("[data-award-btn]");
  const awardStatus = document.querySelector("[data-award-status]");

  let currentEmail = null;

  /* ---------------------------------------------------------
     Cliente HTTP
  --------------------------------------------------------- */

  async function api(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    let data = {};
    try {
      data = await res.json();
    } catch (error) {
      /* respuesta no-JSON */
    }
    if (!res.ok) {
      throw new Error(data.error || "Ocurrió un error.");
    }
    return data;
  }

  function setStatus(el, message, type) {
    el.textContent = message || "";
    el.className = "auth-form-status" + (type ? ` is-${type}` : "");
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("es-AR");
  }

  /* ---------------------------------------------------------
     Verificar que sea admin
  --------------------------------------------------------- */

  async function checkAdmin() {
    let data;
    try {
      const res = await fetch(API + "me.php", { credentials: "same-origin" });
      data = await res.json();
    } catch (error) {
      return;
    }

    if (!data.user) {
      window.location.replace("ingresar.html?next=/admin.html");
      return;
    }

    if (!data.user.isAdmin) {
      gate.hidden = false;
      panel.hidden = true;
      return;
    }

    gate.hidden = true;
    panel.hidden = false;
  }

  /* ---------------------------------------------------------
     Buscar usuario
  --------------------------------------------------------- */

  async function findUser() {
    const email = String(emailInput.value || "").trim();
    if (!email) {
      setStatus(findStatus, "Escribí el email del cliente.", "error");
      return;
    }

    setStatus(findStatus, "Buscando…", "");
    foundCard.hidden = true;
    awardSection.hidden = true;

    try {
      const { user } = await api("admin/lookup.php", { email });
      currentEmail = user.email;
      foundAvatar.textContent = user.avatar || "🍔";
      foundName.textContent = user.name;
      foundPoints.textContent = fmt(user.points);
      foundXp.textContent = fmt(user.xp);
      foundCard.hidden = false;
      awardSection.hidden = false;
      setStatus(findStatus, "", "");
      pointsInput.focus();
    } catch (error) {
      currentEmail = null;
      setStatus(findStatus, error.message, "error");
    }
  }

  /* ---------------------------------------------------------
     Cargar puntos
  --------------------------------------------------------- */

  async function award() {
    if (!currentEmail) {
      setStatus(awardStatus, "Primero buscá un cliente.", "error");
      return;
    }

    const points = parseInt(pointsInput.value, 10) || 0;
    const xp = parseInt(xpInput.value, 10) || 0;
    const reason = String(reasonInput.value || "").trim() || "Carga manual";

    if (points === 0 && xp === 0) {
      setStatus(awardStatus, "Indicá cuántos puntos (o XP) cargar.", "error");
      return;
    }

    awardBtn.disabled = true;
    const originalText = awardBtn.textContent;
    awardBtn.textContent = "Cargando…";
    setStatus(awardStatus, "", "");

    try {
      const { user } = await api("admin/award.php", {
        email: currentEmail,
        points,
        xp,
        reason
      });
      foundPoints.textContent = fmt(user.points);
      foundXp.textContent = fmt(user.xp);
      setStatus(
        awardStatus,
        `✅ ${user.name} ahora tiene ${fmt(user.points)} puntos.`,
        "ok"
      );
      pointsInput.value = "";
      xpInput.value = "";
      reasonInput.value = "";
    } catch (error) {
      setStatus(awardStatus, error.message, "error");
    } finally {
      awardBtn.disabled = false;
      awardBtn.textContent = originalText;
    }
  }

  /* ---------------------------------------------------------
     Eventos
  --------------------------------------------------------- */

  findBtn.addEventListener("click", findUser);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      findUser();
    }
  });
  awardBtn.addEventListener("click", award);

  checkAdmin();
})();
