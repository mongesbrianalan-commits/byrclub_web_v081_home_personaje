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

  /* ---------------------------------------------------------
     Cumpleaños del mes
  --------------------------------------------------------- */

  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const bdayMonth = document.querySelector("[data-bday-month]");
  const bdayRefresh = document.querySelector("[data-bday-refresh]");
  const bdayStatus = document.querySelector("[data-bday-status]");
  const bdayList = document.querySelector("[data-bday-list]");

  function initBirthdays() {
    if (!bdayMonth) return;
    const current = new Date().getMonth() + 1;
    bdayMonth.innerHTML = "";
    MESES.forEach((label, i) => {
      const opt = document.createElement("option");
      opt.value = String(i + 1);
      opt.textContent = label;
      if (i + 1 === current) opt.selected = true;
      bdayMonth.appendChild(opt);
    });
    bdayRefresh?.addEventListener("click", loadBirthdays);
    bdayMonth.addEventListener("change", loadBirthdays);
    loadBirthdays();
  }

  async function loadBirthdays() {
    const month = parseInt(bdayMonth.value, 10) || new Date().getMonth() + 1;
    setStatus(bdayStatus, "Cargando…", "");
    bdayList.innerHTML = "";
    try {
      const res = await fetch(`${API}admin/birthdays.php?month=${month}`, {
        credentials: "same-origin"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar.");
      renderBirthdays(data.birthdays || [], month);
      setStatus(bdayStatus, "", "");
    } catch (error) {
      setStatus(bdayStatus, error.message, "error");
    }
  }

  function renderBirthdays(list, month) {
    if (!list.length) {
      bdayList.innerHTML =
        `<p class="bday-empty">Nadie cumple en ${MESES[month - 1]} (o todavía no cargaron su fecha).</p>`;
      return;
    }
    bdayList.innerHTML = "";
    list.forEach((p) => {
      const item = document.createElement("div");
      item.className = "bday-item";

      const digits = String(p.whatsapp || "").replace(/\D/g, "");
      const waBtn = digits
        ? `<a class="bday-wa-btn" href="https://wa.me/${digits}" target="_blank" rel="noreferrer">💬</a>`
        : "";

      item.innerHTML = `
        <div class="bday-item__day">${p.day}</div>
        <div class="bday-item__info">
          <div class="bday-item__name">${escapeHtml(p.avatar || "🍔")} ${escapeHtml(p.name || "—")}</div>
          <div class="bday-item__wa">${escapeHtml(p.whatsapp || "sin WhatsApp")}</div>
        </div>
        ${waBtn}
      `;
      bdayList.appendChild(item);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /* ---------------------------------------------------------
     Validar / canjear premios de la ruleta
  --------------------------------------------------------- */

  const redeemCode = document.querySelector("[data-redeem-code]");
  const redeemFind = document.querySelector("[data-redeem-find]");
  const redeemStatus = document.querySelector("[data-redeem-status]");
  const redeemCard = document.querySelector("[data-redeem-card]");
  const redeemPrize = document.querySelector("[data-redeem-prize]");
  const redeemCustomer = document.querySelector("[data-redeem-customer]");
  const redeemState = document.querySelector("[data-redeem-state]");
  const redeemConfirm = document.querySelector("[data-redeem-confirm]");

  let currentRedeemCode = null;

  function showRedemption(r) {
    redeemPrize.textContent = `${r.prize}`;
    redeemCustomer.textContent = r.customer;
    const pending = r.status === "pending";
    redeemState.textContent = pending ? "Pendiente" : "Ya canjeado";
    redeemState.className = "redeem-state " + (pending ? "pending" : "redeemed");
    redeemConfirm.hidden = !pending;
    redeemConfirm.disabled = !pending;
    redeemConfirm.textContent = "Marcar como canjeado ✓";
    redeemCard.hidden = false;
  }

  async function findRedemption() {
    const code = String(redeemCode.value || "").trim().toUpperCase();
    if (!code) {
      setStatus(redeemStatus, "Escribí un código.", "error");
      return;
    }
    setStatus(redeemStatus, "Buscando…", "");
    redeemCard.hidden = true;
    try {
      const { redemption } = await api("admin/redeem-lookup.php", { code });
      currentRedeemCode = redemption.code;
      showRedemption(redemption);
      setStatus(redeemStatus, "", "");
    } catch (error) {
      currentRedeemCode = null;
      setStatus(redeemStatus, error.message, "error");
    }
  }

  async function confirmRedeem() {
    if (!currentRedeemCode) return;
    redeemConfirm.disabled = true;
    redeemConfirm.textContent = "Canjeando…";
    try {
      const res = await api("admin/redeem.php", { code: currentRedeemCode });
      redeemState.textContent = "Ya canjeado";
      redeemState.className = "redeem-state redeemed";
      redeemConfirm.hidden = true;
      setStatus(redeemStatus, `✅ Canje confirmado: ${res.prize} de ${res.customer}.`, "ok");
    } catch (error) {
      setStatus(redeemStatus, error.message, "error");
      redeemConfirm.disabled = false;
      redeemConfirm.textContent = "Marcar como canjeado ✓";
      /* Si ya estaba canjeado, refrescamos el estado mostrado. */
      redeemState.textContent = "Ya canjeado";
      redeemState.className = "redeem-state redeemed";
      redeemConfirm.hidden = true;
    }
  }

  if (redeemFind) redeemFind.addEventListener("click", findRedemption);
  if (redeemCode) {
    redeemCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        findRedemption();
      }
    });
  }
  if (redeemConfirm) redeemConfirm.addEventListener("click", confirmRedeem);

  checkAdmin().then(() => {
    if (panel && !panel.hidden) initBirthdays();
  });
})();
