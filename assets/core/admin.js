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

  const resetSection = document.querySelector("[data-reset-section]");
  const resetPass = document.querySelector("[data-reset-pass]");
  const resetGen = document.querySelector("[data-reset-gen]");
  const resetBtn = document.querySelector("[data-reset-btn]");
  const resetStatus = document.querySelector("[data-reset-status]");
  const resetDone = document.querySelector("[data-reset-done]");
  const resetShown = document.querySelector("[data-reset-shown]");
  const resetCopy = document.querySelector("[data-reset-copy]");
  const resetWa = document.querySelector("[data-reset-wa]");

  const roleSection = document.querySelector("[data-role-section]");
  const roleSelect = document.querySelector("[data-role-select]");
  const roleSave = document.querySelector("[data-role-save]");
  const roleStatus = document.querySelector("[data-role-status]");

  let currentEmail = null;
  let currentUser = null;
  let currentRole = "admin"; // rol del staff logueado; lo setea checkStaff()

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

  // Qué pestañas ve cada rol (admin ve todo).
  const TAB_ROLES = {
    clientes: ["admin"],
    pedidos:  ["admin", "cajero", "cocina"],
    caja:     ["admin", "cajero"],
    menu:     ["admin"],
    canjes:   ["admin", "cajero"],
    cumples:  ["admin"],
    prode:    ["admin"],
  };

  function applyRoleTabs(role) {
    let firstAllowed = null;
    Object.keys(TAB_ROLES).forEach((tab) => {
      const allowed = TAB_ROLES[tab].includes(role);
      const btn = document.querySelector(`[data-tab-btn="${tab}"]`);
      const panelEl = document.querySelector(`[data-tab="${tab}"]`);
      if (btn) btn.style.display = allowed ? "" : "none";
      if (panelEl && !allowed) panelEl.hidden = true;
      if (allowed && !firstAllowed) firstAllowed = tab;
    });
    // Activar la primera pestaña permitida (por si la default no lo está).
    if (firstAllowed) {
      const btn = document.querySelector(`[data-tab-btn="${firstAllowed}"]`);
      if (btn) btn.click();
    }
  }

  async function checkStaff() {
    let data;
    try {
      const res = await fetch(API + "me.php", { credentials: "same-origin" });
      data = await res.json();
    } catch (error) {
      return null;
    }

    if (!data.user) {
      window.location.replace("ingresar.html?next=/admin.html");
      return null;
    }

    const role = data.user.role || (data.user.isAdmin ? "admin" : "socio");
    if (!["admin", "cajero", "cocina"].includes(role)) {
      gate.hidden = false;
      panel.hidden = true;
      return null;
    }

    currentRole = role;
    gate.hidden = true;
    panel.hidden = false;
    applyRoleTabs(role);
    return role;
  }

  /* ---------------------------------------------------------
     Buscar usuario
  --------------------------------------------------------- */

  const matchesBox = document.querySelector("[data-matches]");

  async function findUser() {
    const query = String(emailInput.value || "").trim();
    if (!query) {
      setStatus(findStatus, "Escribí un email o número de WhatsApp.", "error");
      return;
    }

    setStatus(findStatus, "Buscando…", "");
    foundCard.hidden = true;
    awardSection.hidden = true;
    if (resetSection) resetSection.hidden = true;
    if (roleSection) roleSection.hidden = true;
    if (matchesBox) {
      matchesBox.hidden = true;
      matchesBox.innerHTML = "";
    }

    try {
      const data = await api("admin/lookup.php", { query });
      if (data.matches) {
        renderMatches(data.matches);
        setStatus(findStatus, "Hay varias cuentas con ese número. Elegí cuál:", "");
        return;
      }
      selectFoundUser(data.user);
    } catch (error) {
      currentEmail = null;
      setStatus(findStatus, error.message, "error");
    }
  }

  function selectFoundUser(user) {
    currentEmail = user.email;
    currentUser = user;
    foundAvatar.textContent = user.avatar || "🍔";
    foundName.textContent = user.name;
    foundPoints.textContent = fmt(user.points);
    foundXp.textContent = fmt(user.xp);
    foundCard.hidden = false;
    awardSection.hidden = false;
    if (resetSection) {
      resetSection.hidden = false;
      if (resetDone) resetDone.hidden = true;
      setStatus(resetStatus, "", "");
      if (resetPass) resetPass.value = "";
    }
    if (roleSection) {
      roleSection.hidden = false;
      if (roleSelect) roleSelect.value = user.role || "socio";
      if (roleStatus) setStatus(roleStatus, "", "");
    }
    setStatus(findStatus, "", "");
    pointsInput.focus();
  }

  function initRoleMgmt() {
    if (!roleSave) return;
    roleSave.addEventListener("click", async () => {
      if (!currentEmail) { setStatus(roleStatus, "Primero buscá un cliente.", "error"); return; }
      roleSave.disabled = true;
      try {
        const r = await api("admin/set-role.php", { email: currentEmail, role: roleSelect.value });
        setStatus(roleStatus, `✅ ${r.name} ahora es ${r.role}.`, "ok");
      } catch (error) {
        setStatus(roleStatus, error.message, "error");
      } finally {
        roleSave.disabled = false;
      }
    });
  }

  function renderMatches(list) {
    if (!matchesBox) {
      selectFoundUser(list[0]);
      return;
    }
    matchesBox.innerHTML = "";
    list.forEach((user) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "match-pick";
      btn.innerHTML =
        `<b>${escapeHtml(user.name)}</b> · ${fmt(user.points)} pts` +
        `<small>${escapeHtml(user.whatsapp || "sin WhatsApp")} · ${escapeHtml(user.email)}</small>`;
      btn.addEventListener("click", () => {
        matchesBox.hidden = true;
        selectFoundUser(user);
      });
      matchesBox.appendChild(btn);
    });
    matchesBox.hidden = false;
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
     Restablecer contraseña (cliente que se la olvidó)
  --------------------------------------------------------- */

  function generatePassword() {
    /* Corta, fácil de dictar por WhatsApp y sin caracteres confusos. */
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return "byr-" + s;
  }

  async function resetPassword() {
    if (!currentEmail) {
      setStatus(resetStatus, "Primero buscá un cliente.", "error");
      return;
    }
    const password = String(resetPass.value || "").trim();
    if (password.length < 6) {
      setStatus(resetStatus, "La contraseña necesita al menos 6 caracteres.", "error");
      return;
    }

    resetBtn.disabled = true;
    const originalText = resetBtn.textContent;
    resetBtn.textContent = "Guardando…";
    setStatus(resetStatus, "", "");
    if (resetDone) resetDone.hidden = true;

    try {
      const { user } = await api("admin/reset-password.php", {
        email: currentEmail,
        password
      });
      setStatus(resetStatus, `✅ Contraseña actualizada para ${user.name}.`, "ok");
      showResetDone(user, password);
    } catch (error) {
      setStatus(resetStatus, error.message, "error");
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = originalText;
    }
  }

  function showResetDone(user, password) {
    if (!resetDone) return;
    resetShown.textContent = password;

    const digits = String((user && user.whatsapp) || (currentUser && currentUser.whatsapp) || "").replace(/\D/g, "");
    const msg =
      `¡Hola ${user.name}! 👋 Tu nueva contraseña para BYR Club es: ${password}\n\n` +
      `Ingresá con tu email y esta contraseña. Después podés cambiarla desde tu perfil. 🍔`;
    if (digits) {
      resetWa.href = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
      resetWa.hidden = false;
    } else {
      resetWa.hidden = true;
    }
    resetDone.hidden = false;
  }

  async function copyResetPass() {
    const text = resetShown.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      const prev = resetCopy.textContent;
      resetCopy.textContent = "✓ Copiada";
      setTimeout(() => { resetCopy.textContent = prev; }, 1500);
    } catch (error) {
      /* Si el navegador no deja copiar, al menos queda visible para tipearla. */
    }
  }

  if (resetGen) {
    resetGen.addEventListener("click", () => { resetPass.value = generatePassword(); });
  }
  if (resetBtn) resetBtn.addEventListener("click", resetPassword);
  if (resetCopy) resetCopy.addEventListener("click", copyResetPass);

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
    const expired = pending && r.expired;
    const canRedeem = pending && !expired;

    if (expired) {
      redeemState.textContent = "Vencido";
      redeemState.className = "redeem-state expired";
    } else if (r.usedOnWeb) {
      /* El 2x1 pedido por la web ya se consumió en el pedido. Se dice con
         todas las letras: si no, el cajero ve "Ya canjeado" y queda dudando
         si el cliente vino más temprano o si hay un error. */
      redeemState.textContent = "YA USADO — lo pidió por la web";
      redeemState.className = "redeem-state redeemed";
    } else {
      redeemState.textContent = pending ? "Pendiente" : "Ya canjeado";
      redeemState.className = "redeem-state " + (pending ? "pending" : "redeemed");
    }

    redeemConfirm.hidden = !canRedeem;
    redeemConfirm.disabled = !canRedeem;
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

  /* ---------------------------------------------------------
     Prode — sincronizar fecha y cargar resultados
  --------------------------------------------------------- */

  const prodeName = document.querySelector("[data-prode-name]");
  const prodeFrom = document.querySelector("[data-prode-from]");
  const prodeTo = document.querySelector("[data-prode-to]");
  const prodeSyncBtn = document.querySelector("[data-prode-sync]");
  const prodeSyncStatus = document.querySelector("[data-prode-sync-status]");
  const prodeRoundId = document.querySelector("[data-prode-round-id]");
  const prodeResultsBtn = document.querySelector("[data-prode-results]");
  const prodeResultsStatus = document.querySelector("[data-prode-results-status]");

  async function prodeSync() {
    const name = String(prodeName.value || "").trim();
    const from = prodeFrom.value;
    const to = prodeTo.value;
    if (!name) {
      setStatus(prodeSyncStatus, "Poné un nombre para la fecha.", "error");
      return;
    }
    if (!from || !to) {
      setStatus(prodeSyncStatus, "Elegí las fechas desde y hasta.", "error");
      return;
    }
    prodeSyncBtn.disabled = true;
    setStatus(prodeSyncStatus, "Sincronizando con la API…", "");
    try {
      const data = await api("admin/prode-sync.php", { name, from, to });
      setStatus(prodeSyncStatus, `✅ ${data.synced} partidos cargados en "${data.round}" (ID ${data.roundId}).`, "ok");
      if (prodeRoundId) prodeRoundId.value = data.roundId;
    } catch (error) {
      setStatus(prodeSyncStatus, error.message, "error");
    } finally {
      prodeSyncBtn.disabled = false;
    }
  }

  async function prodeResults() {
    const roundId = parseInt(prodeRoundId.value, 10) || 0;
    if (roundId <= 0) {
      setStatus(prodeResultsStatus, "Poné el ID de la fecha (te lo da el sync).", "error");
      return;
    }
    prodeResultsBtn.disabled = true;
    setStatus(prodeResultsStatus, "Trayendo resultados…", "");
    try {
      const data = await api("admin/prode-results.php", { roundId });
      let msg = `✅ ${data.matchesFinished}/${data.matchesTotal} partidos jugados · ${data.predsScored} pronósticos puntuados.`;
      if (data.roundClosed) {
        msg += data.winner
          ? ` 🏆 Ganador: ${data.winner.name} (${data.winner.points} pts). Cupón: ${data.winner.code}.`
          : " Fecha cerrada (sin ganador con puntos).";
      }
      setStatus(prodeResultsStatus, msg, "ok");
    } catch (error) {
      setStatus(prodeResultsStatus, error.message, "error");
    } finally {
      prodeResultsBtn.disabled = false;
    }
  }

  if (prodeSyncBtn) prodeSyncBtn.addEventListener("click", prodeSync);
  if (prodeResultsBtn) prodeResultsBtn.addEventListener("click", prodeResults);

  /* ---------------------------------------------------------
     Prode — carga manual (partidos y resultados)
  --------------------------------------------------------- */

  const pmRound = document.querySelector("[data-pm-round]");
  const pmHome = document.querySelector("[data-pm-home]");
  const pmAway = document.querySelector("[data-pm-away]");
  const pmDate = document.querySelector("[data-pm-date]");
  const pmTime = document.querySelector("[data-pm-time]");
  const pmAddBtn = document.querySelector("[data-pm-add]");
  const pmStatus = document.querySelector("[data-pm-status]");

  const pmatchRoundId = document.querySelector("[data-pmatch-round-id]");
  const pmatchLoadBtn = document.querySelector("[data-pmatch-load]");
  const pmatchStatus = document.querySelector("[data-pmatch-status]");
  const pmatchList = document.querySelector("[data-pmatch-list]");

  /* ---------------------------------------------------------
     Prode — pegar la fecha entera
     ---------------------------------------------------------
     Cargar de a un partido son cinco campos por catorce partidos. Acá se pega
     la lista y el servidor la interpreta. Va en dos pasos a propósito:
     "Revisar" no toca nada y muestra cómo entendió cada línea; recién con eso
     a la vista aparece el botón de cargar. Pegar catorce partidos a ciegas y
     que entren mal es peor que cargarlos a mano.
  --------------------------------------------------------- */

  const pbRound   = document.querySelector("[data-pb-round]");
  const pbText    = document.querySelector("[data-pb-text]");
  const pbReview  = document.querySelector("[data-pb-review]");
  const pbCommit  = document.querySelector("[data-pb-commit]");
  const pbStatus  = document.querySelector("[data-pb-status]");
  const pbPreview = document.querySelector("[data-pb-preview]");

  /* Llama al endpoint sin pasar por api(): cuando rechaza por líneas con error
     el cuerpo trae el detalle línea por línea, y api() lo tira. */
  async function pbCall(dryRun) {
    const res = await fetch(`${API}admin/prode-bulk-matches.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        roundName: String(pbRound.value || "").trim(),
        text: String(pbText.value || ""),
        dryRun,
      }),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* respuesta no-JSON */ }
    return { ok: res.ok, data };
  }

  function pbRenderPreview(rows) {
    pbPreview.innerHTML = "";
    if (!Array.isArray(rows) || !rows.length) return;
    const list = document.createElement("div");
    list.className = "pb-list";

    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "pb-row is-" + r.kind;

      const ln = document.createElement("span");
      ln.className = "pb-row__ln";
      ln.textContent = r.line;

      const main = document.createElement("div");
      main.className = "pb-row__main";

      if (r.kind === "match") {
        main.innerHTML = `⚽ <b>${escapeHtml(r.home)}</b> vs <b>${escapeHtml(r.away)}</b>` +
          `<div class="pb-row__when">${escapeHtml(r.kickoffLabel || "")}</div>`;
      } else if (r.kind === "day") {
        main.innerHTML = `📅 Día para las líneas de abajo: <b>${escapeHtml(r.date)}</b>`;
      } else if (r.kind === "duplicate") {
        const why = r.duplicate === "ya-cargado"
          ? "ya estaba cargado en esta fecha"
          : "está repetido en la lista";
        main.innerHTML = `⏭️ <b>${escapeHtml(r.home)}</b> vs <b>${escapeHtml(r.away)}</b> — se saltea, ${why}.`;
      } else {
        main.innerHTML = `⚠️ ${escapeHtml(r.error || "No se pudo interpretar.")}` +
          `<div class="pb-row__raw">${escapeHtml(r.raw || "")}</div>`;
      }

      row.append(ln, main);
      list.append(row);
    });

    pbPreview.append(list);
  }

  function pbSummary(c) {
    const bits = [];
    if (c.matches) bits.push(`${c.matches} partido${c.matches === 1 ? "" : "s"}`);
    if (c.duplicates) bits.push(`${c.duplicates} repetido${c.duplicates === 1 ? "" : "s"} (se saltean)`);
    if (c.errors) bits.push(`${c.errors} con error`);
    return bits.join(" · ") || "nada";
  }

  async function prodeBulkReview() {
    if (!String(pbRound.value || "").trim()) {
      setStatus(pbStatus, "Ponele un nombre a la fecha (ej. \"Fecha 8\").", "error");
      return;
    }
    if (!String(pbText.value || "").trim()) {
      setStatus(pbStatus, "Pegá la lista de partidos.", "error");
      return;
    }
    pbReview.disabled = true;
    pbCommit.hidden = true;
    setStatus(pbStatus, "Revisando…", "");
    try {
      const { ok, data } = await pbCall(true);
      if (!ok) {
        pbPreview.innerHTML = "";
        setStatus(pbStatus, data.error || "No se pudo revisar la lista.", "error");
        return;
      }
      pbRenderPreview(data.rows);
      const c = data.counts || {};
      if (c.errors) {
        setStatus(pbStatus, `⚠️ ${pbSummary(c)}. Corregí las líneas marcadas y volvé a revisar: así como está no se carga nada.`, "error");
        return;
      }
      if (!c.matches) {
        setStatus(pbStatus, "Todos los partidos de la lista ya estaban cargados en esta fecha.", "error");
        return;
      }
      const dondeVa = data.roundExists
        ? `se van a agregar a la fecha «${data.roundName}», que ya existe (ID ${data.roundId})`
        : `se va a crear la fecha «${data.roundName}»`;
      setStatus(pbStatus, `✅ ${pbSummary(c)}. Si está bien, ${dondeVa}.`, "ok");
      pbCommit.textContent = `Cargar ${c.matches} partido${c.matches === 1 ? "" : "s"}`;
      pbCommit.hidden = false;
    } catch (error) {
      setStatus(pbStatus, "No hay conexión. Probá de nuevo.", "error");
    } finally {
      pbReview.disabled = false;
    }
  }

  async function prodeBulkCommit() {
    pbCommit.disabled = true;
    pbReview.disabled = true;
    setStatus(pbStatus, "Cargando…", "");
    try {
      const { ok, data } = await pbCall(false);
      if (!ok) {
        if (Array.isArray(data.rows)) pbRenderPreview(data.rows);
        setStatus(pbStatus, data.error || "No se pudieron cargar los partidos.", "error");
        return;
      }
      pbRenderPreview(data.rows);
      const c = data.counts || {};
      setStatus(pbStatus, `✅ Cargados ${c.matches} partidos en «${data.roundName}» · fecha ID ${data.roundId}.`, "ok");
      pbCommit.hidden = true;
      /* El ID de la fecha es lo que piden los dos bloques de resultados: se lo
         dejamos puesto para no tener que anotarlo. */
      if (pmatchRoundId) pmatchRoundId.value = data.roundId;
      if (prodeRoundId) prodeRoundId.value = data.roundId;
    } catch (error) {
      setStatus(pbStatus, "No hay conexión. Puede que se hayan cargado igual: tocá Revisar para ver si quedaron.", "error");
    } finally {
      pbCommit.disabled = false;
      pbReview.disabled = false;
    }
  }

  async function prodeAddMatch() {
    const roundName = String(pmRound.value || "").trim();
    const home = String(pmHome.value || "").trim();
    const away = String(pmAway.value || "").trim();
    const date = pmDate.value;
    const time = pmTime.value;
    if (!roundName || !home || !away) {
      setStatus(pmStatus, "Completá la fecha, el local y el visitante.", "error");
      return;
    }
    if (!date || !time) {
      setStatus(pmStatus, "Elegí el día y la hora del partido.", "error");
      return;
    }
    pmAddBtn.disabled = true;
    setStatus(pmStatus, "Agregando…", "");
    try {
      const d = await api("admin/prode-add-match.php", { roundName, home, away, date, time });
      setStatus(pmStatus, `✅ ${d.home} vs ${d.away} (${d.kickoffLabel}) · partido ID ${d.matchId} · fecha ID ${d.roundId}.`, "ok");
      if (pmatchRoundId) pmatchRoundId.value = d.roundId;
      pmHome.value = "";
      pmAway.value = "";
      pmHome.focus();
    } catch (error) {
      setStatus(pmStatus, error.message, "error");
    } finally {
      pmAddBtn.disabled = false;
    }
  }

  async function prodeLoadMatches() {
    const roundId = parseInt(pmatchRoundId.value, 10) || 0;
    if (roundId <= 0) {
      setStatus(pmatchStatus, "Poné el ID de la fecha (te lo da la carga del partido).", "error");
      return;
    }
    setStatus(pmatchStatus, "Cargando…", "");
    pmatchList.innerHTML = "";
    try {
      const d = await api("admin/prode-round-matches.php", { roundId });
      renderProdeMatches(d.matches || []);
      setStatus(pmatchStatus, (d.matches && d.matches.length) ? `Fecha "${d.round}"` : "Esa fecha todavía no tiene partidos.", "");
    } catch (error) {
      setStatus(pmatchStatus, error.message, "error");
    }
  }

  function renderProdeMatches(matches) {
    pmatchList.innerHTML = "";
    matches.forEach((m) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.style.cssText = "align-items:flex-end;gap:10px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.12);padding-top:12px;margin-top:12px";

      const info = document.createElement("div");
      info.style.cssText = "flex:1 1 280px";

      const teamRow = document.createElement("div");
      teamRow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
      const homeIn = teamNameInput(m.home);
      const vs = document.createElement("span");
      vs.textContent = "vs"; vs.style.fontWeight = "800";
      const awayIn = teamNameInput(m.away);
      const saveTeams = document.createElement("button");
      saveTeams.type = "button"; saveTeams.className = "admin-btn-inline";
      saveTeams.textContent = "Guardar";
      saveTeams.style.cssText = "padding:7px 12px";
      teamRow.append(homeIn, vs, awayIn, saveTeams);

      /* Horario en hora de Argentina (el server lo pasa a UTC). */
      const timeRow = document.createElement("div");
      timeRow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px";
      const dateIn = document.createElement("input");
      dateIn.type = "date"; dateIn.value = m.date || "";
      const timeIn = document.createElement("input");
      timeIn.type = "time"; timeIn.value = m.time || "";
      const timeLabel = document.createElement("small");
      timeLabel.textContent = "Horario";
      timeLabel.style.cssText = "color:#9fb4dc;font-weight:800";
      timeRow.append(timeLabel, dateIn, timeIn);

      const meta = document.createElement("small");
      meta.style.cssText = "display:block;margin-top:5px;color:#9fb4dc";
      const metaText = (label) =>
        `#${m.id} · ${label || ""} · ${m.status === "finished" ? "Jugado" : "Pendiente"}`;
      meta.textContent = metaText(m.kickoffLabel);

      const editSt = document.createElement("small");
      editSt.style.cssText = "display:block;margin-top:2px;font-weight:700";

      info.append(teamRow, timeRow, meta, editSt);

      saveTeams.addEventListener("click", async () => {
        const home = String(homeIn.value || "").trim();
        const away = String(awayIn.value || "").trim();
        const date = String(dateIn.value || "").trim();
        const time = String(timeIn.value || "").trim();
        if (!home || !away) {
          editSt.textContent = "Completá ambos equipos.";
          editSt.style.color = "#ffd35a";
          return;
        }
        if ((date && !time) || (!date && time)) {
          editSt.textContent = "Para cambiar el horario cargá día y hora.";
          editSt.style.color = "#ffd35a";
          return;
        }
        saveTeams.disabled = true;
        saveTeams.textContent = "Guardando…";
        try {
          const r = await api("admin/prode-edit-match.php", { matchId: m.id, home, away, date, time });
          if (r.kickoffLabel) meta.textContent = metaText(r.kickoffLabel);
          editSt.textContent = `✅ Guardado · escudos: local ${r.homeLogo ? "✓" : "✗"} · visitante ${r.awayLogo ? "✓" : "✗"}`;
          editSt.style.color = "#7bffa0";
        } catch (error) {
          editSt.textContent = error.message;
          editSt.style.color = "#ff8f9a";
        } finally {
          saveTeams.disabled = false;
          saveTeams.textContent = "Guardar";
        }
      });

      const hg = document.createElement("input");
      hg.type = "number"; hg.min = "0"; hg.placeholder = "0";
      hg.style.cssText = "width:56px;text-align:center";
      if (m.homeGoals !== null && m.homeGoals !== undefined) hg.value = m.homeGoals;

      const sep = document.createElement("span");
      sep.textContent = "—"; sep.style.alignSelf = "center";

      const ag = document.createElement("input");
      ag.type = "number"; ag.min = "0"; ag.placeholder = "0";
      ag.style.cssText = "width:56px;text-align:center";
      if (m.awayGoals !== null && m.awayGoals !== undefined) ag.value = m.awayGoals;

      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "admin-btn-inline";
      btn.textContent = m.status === "finished" ? "Actualizar" : "Cargar resultado";

      const st = document.createElement("small");
      st.style.cssText = "display:block;width:100%;margin-top:4px;font-weight:700";

      btn.addEventListener("click", async () => {
        if (hg.value === "" || ag.value === "") {
          st.textContent = "Cargá ambos goles.";
          st.style.color = "#ffd35a";
          return;
        }
        btn.disabled = true;
        btn.textContent = "Guardando…";
        try {
          const r = await api("admin/prode-set-result.php", {
            matchId: m.id, homeGoals: Number(hg.value), awayGoals: Number(ag.value)
          });
          let msg = `✅ Resultado cargado · ${r.scored} pronósticos puntuados.`;
          if (r.roundClosed) {
            msg += r.winner
              ? ` 🏆 Ganador: ${r.winner.name} (${r.winner.points} pts) · cupón ${r.winner.code}.`
              : " Fecha cerrada.";
          }
          st.textContent = msg;
          st.style.color = "#7bffa0";
        } catch (error) {
          st.textContent = error.message;
          st.style.color = "#ff8f9a";
        } finally {
          btn.disabled = false;
          btn.textContent = "Actualizar";
        }
      });

      /* Borrar: primer clic pide el detalle al server y avisa qué se lleva
         puesto; el segundo confirma. Sin confirmar no se borra nada. */
      const del = document.createElement("button");
      del.type = "button"; del.className = "admin-btn-inline";
      del.textContent = "Borrar";
      del.style.cssText = "background:#8c1626;box-shadow:0 6px 0 #5c0d18";
      let armed = false;

      del.addEventListener("click", async () => {
        del.disabled = true;
        try {
          if (!armed) {
            const p = await api("admin/prode-delete-match.php", { matchId: m.id });
            const preds = p.preds
              ? `${p.preds} pronóstico${p.preds === 1 ? "" : "s"} cargado${p.preds === 1 ? "" : "s"}`
              : "sin pronósticos cargados";
            let aviso = `⚠️ Vas a borrar ${p.home} vs ${p.away} (${preds}). Apretá "Confirmar" para hacerlo.`;
            if (p.scored) aviso += ` Ojo: ${p.scored} ya tenían puntos y la XP que se repartió no se devuelve.`;
            st.textContent = aviso;
            st.style.color = "#ffd35a";
            armed = true;
            del.textContent = "Confirmar";
            return;
          }
          const r = await api("admin/prode-delete-match.php", { matchId: m.id, confirm: true });
          row.remove();
          setStatus(pmatchStatus, `🗑️ Borrado ${r.home} vs ${r.away} (${r.preds} pronósticos).`, "ok");
        } catch (error) {
          st.textContent = error.message;
          st.style.color = "#ff8f9a";
          armed = false;
          del.textContent = "Borrar";
        } finally {
          del.disabled = false;
        }
      });

      row.append(info, hg, sep, ag, btn, del, st);
      pmatchList.append(row);
    });
  }

  function teamNameInput(value) {
    const i = document.createElement("input");
    i.type = "text";
    i.value = value || "";
    i.setAttribute("list", "prode-teams-datalist");
    i.style.cssText = "width:150px;text-align:left;padding:6px 8px";
    return i;
  }

  async function loadProdeTeamsDatalist() {
    const dl = document.getElementById("prode-teams-datalist");
    if (!dl) return;
    try {
      const d = await api("admin/prode-teams-list.php", {});
      dl.innerHTML = "";
      (d.teams || []).forEach((name) => {
        const o = document.createElement("option");
        o.value = name;
        dl.appendChild(o);
      });
    } catch (error) {
      /* silencioso */
    }
  }

  const teamsSyncBtn = document.querySelector("[data-prode-teams-sync]");
  const teamsSyncStatus = document.querySelector("[data-prode-teams-status]");

  async function prodeSyncTeams() {
    teamsSyncBtn.disabled = true;
    setStatus(teamsSyncStatus, "Trayendo escudos…", "");
    try {
      const d = await api("admin/prode-sync-teams.php", {});
      setStatus(teamsSyncStatus, `✅ ${d.teams} escudos cargados · ${d.backfilled} partidos actualizados.`, "ok");
    } catch (error) {
      setStatus(teamsSyncStatus, error.message, "error");
    } finally {
      teamsSyncBtn.disabled = false;
    }
  }

  if (teamsSyncBtn) teamsSyncBtn.addEventListener("click", prodeSyncTeams);

  if (pbReview) pbReview.addEventListener("click", prodeBulkReview);
  if (pbCommit) pbCommit.addEventListener("click", prodeBulkCommit);
  /* Tocar la lista invalida lo revisado: el botón de cargar se esconde hasta
     que se vuelva a revisar, para no cargar algo distinto de lo que se vio. */
  if (pbText) pbText.addEventListener("input", () => { if (pbCommit) pbCommit.hidden = true; });
  if (pbRound) pbRound.addEventListener("input", () => { if (pbCommit) pbCommit.hidden = true; });
  if (pmAddBtn) pmAddBtn.addEventListener("click", prodeAddMatch);
  if (pmatchLoadBtn) pmatchLoadBtn.addEventListener("click", prodeLoadMatches);

  /* ---------------------------------------------------------
     Pedidos de clientes (confirmar acredita puntos + canjea cupón)
  --------------------------------------------------------- */

  const ordersList = document.querySelector("[data-orders-admin-list]");
  const ordersAdminStatus = document.querySelector("[data-orders-admin-status]");
  const ordersFilter = document.querySelector("[data-orders-filter]");
  const ordersRefresh = document.querySelector("[data-orders-refresh]");
  let ordersFilterStatus = "pending";

  /* ---------------------------------------------------------
     Campanita de pedido nuevo

     Cada 15s se le pregunta al server el id del último pedido pendiente. Si
     subió respecto del que ya vimos, es que entró uno: suena y aparece el
     cartel. Sondear un endpoint que devuelve dos números es mucho más barato
     que recargar la lista entera.
  --------------------------------------------------------- */

  const bellToggle   = document.querySelector("[data-bell-toggle]");
  const bellHint     = document.querySelector("[data-bell-hint]");
  const newOrderBox  = document.querySelector("[data-new-order-alert]");
  const newOrderText = document.querySelector("[data-new-order-text]");
  const newOrderSee  = document.querySelector("[data-new-order-see]");

  const BELL_KEY = "byr_admin_bell";
  let bellOn = localStorage.getItem(BELL_KEY) !== "0"; // prendida por defecto
  let lastSeenOrderId = null;   // null = todavía no sondeamos nunca
  let audioCtx = null;
  let ordersPollTimer = null;

  /* La campanita se sintetiza en el navegador: no hay que subir ningún archivo
     de audio y suena igual sin internet. Son dos notas, como un timbre. */
  function playBell() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();

      const now = audioCtx.currentTime;
      // Dos "ding" seguidos, el segundo más agudo.
      [[880, 0], [1174, 0.18]].forEach(([freq, delay]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // Ataque corto y caída larga: suena a campana, no a alarma.
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.35, now + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.9);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 1);
      });
    } catch (e) {
      /* si el navegador no deja sonar, queda el aviso visual */
    }
  }

  function paintBellToggle() {
    if (!bellToggle) return;
    bellToggle.classList.toggle("is-off", !bellOn);
    bellToggle.textContent = bellOn ? "🔔 Campanita" : "🔕 Campanita";
    bellToggle.setAttribute("aria-pressed", bellOn ? "true" : "false");
    if (bellHint) {
      bellHint.textContent = bellOn
        ? "💡 Suena cuando entra un pedido de la web. Dejá esta pestaña abierta."
        : "🔕 La campanita está apagada: los pedidos nuevos solo se ven en la lista.";
    }
  }

  function showNewOrderAlert(count) {
    if (!newOrderBox) return;
    if (newOrderText) {
      newOrderText.textContent = count > 1
        ? `🔔 ¡Entraron ${count} pedidos nuevos!`
        : "🔔 ¡Entró un pedido nuevo!";
    }
    newOrderBox.hidden = false;
  }

  async function pollNewOrders() {
    try {
      const data = await api("admin/orders-ping.php", {});
      const lastId = Number(data.lastId) || 0;

      // La primera vuelta solo toma nota: si no, suena apenas se abre el panel
      // por pedidos que ya estaban ahí.
      if (lastSeenOrderId === null) {
        lastSeenOrderId = lastId;
        return;
      }
      if (lastId > lastSeenOrderId) {
        lastSeenOrderId = lastId;
        if (bellOn) playBell();
        showNewOrderAlert(Number(data.pending) || 1);
        loadOrders();
      }
    } catch (error) {
      /* Sin conexión o sesión vencida: se reintenta en la próxima vuelta. */
    }
  }

  function startOrdersPolling() {
    if (ordersPollTimer) return;
    pollNewOrders();
    ordersPollTimer = setInterval(pollNewOrders, 15000);
  }

  function money(n) {
    return "$" + fmt(n);
  }

  const ORDER_STATUS = {
    pending:    { label: "Recibido",       cls: "pending" },
    confirmed:  { label: "Aceptado",       cls: "confirmed" },
    preparing:  { label: "En preparación", cls: "preparing" },
    on_the_way: { label: "En camino",      cls: "onway" },
    delivered:  { label: "Entregado",      cls: "delivered" },
    cancelled:  { label: "Cancelado",      cls: "cancelled" }
  };

  // Lo que realmente paga el cliente: comida + envío. Los pedidos viejos (y los
  // de mostrador) no tienen envío, así que cae en itemsTotal.
  function orderTotal(o) {
    return o.total != null ? o.total : (o.itemsTotal || 0) + (o.shippingCost || 0);
  }

  // Próximo estado según el actual y la forma de entrega (retiro salta "en camino").
  function nextStage(status, fulfillment) {
    if (status === "confirmed") return "preparing";
    if (status === "preparing") return fulfillment === "delivery" ? "on_the_way" : "delivered";
    if (status === "on_the_way") return "delivered";
    return null;
  }

  async function loadOrders() {
    if (!ordersList) return;
    setStatus(ordersAdminStatus, "Cargando pedidos…", "");
    ordersList.innerHTML = "";
    try {
      const q = ordersFilterStatus ? `?status=${ordersFilterStatus}` : "";
      const res = await fetch(`${API}admin/orders-list.php${q}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los pedidos.");
      renderOrders(data.orders || []);
      setStatus(ordersAdminStatus, "", "");
    } catch (error) {
      setStatus(ordersAdminStatus, error.message, "error");
    }
  }

  function renderOrders(list) {
    ordersList.innerHTML = "";
    if (!list.length) {
      ordersList.innerHTML = `<p class="oa-empty">No hay pedidos${ordersFilterStatus === "pending" ? " pendientes" : ""} por ahora.</p>`;
      return;
    }
    list.forEach((o) => ordersList.append(orderAdminCard(o)));
  }

  function orderAdminCard(o) {
    const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
    const card = document.createElement("article");
    card.className = "oa-card is-" + o.status;

    const digits = String(o.customerPhone || "").replace(/\D/g, "");
    const waLink = digits
      ? ` <a href="https://wa.me/${digits}" target="_blank" rel="noreferrer">💬 ${escapeHtml(o.customerPhone)}</a>`
      : (o.customerPhone ? ` · ${escapeHtml(o.customerPhone)}` : "");

    const itemsHtml = (o.items || [])
      .map((ln) => {
        const opts = ln.options ? `<small style="display:block;color:#9bd1ff;font-weight:700">${escapeHtml(ln.options)}</small>` : "";
        return `<li><span>${escapeHtml(String(ln.qty))}× ${escapeHtml(ln.name)}${opts}</span><span>${money(ln.subtotal)}</span></li>`;
      })
      .join("");

    const fulfillHtml = o.fulfillment === "delivery"
      ? `🛵 Delivery · <span class="oa-addr">${escapeHtml(o.address || "sin dirección")}</span>`
      : "🏪 Retiro en el local";
    /* Si el cupón multiplica los puntos ("2x puntos"), lo decimos ACÁ, antes
       de confirmar: si no, el cajero ve un número acreditado que no cierra
       con el sugerido y parece un error. */
    const couponBonus = Number(o.couponMultiplier) > 1
      ? ` <strong>Multiplica los puntos x${Number(o.couponMultiplier)}</strong> al confirmar.`
      : "";

    const couponHtml = o.couponLabel
      ? `<div class="oa-coupon">🎟️ Cupón adjunto: ${escapeHtml(o.couponLabel)} (${escapeHtml(o.couponCode || "")}) — se marca canjeado al confirmar.${couponBonus}</div>`
      : "";

    const notesHtml = o.notes
      ? `<div class="oa-fulfill">📝 ${escapeHtml(o.notes)}</div>`
      : "";

    // El envío va aparte: `itemsTotal` es solo la comida.
    const shipHtml = o.shippingCost > 0
      ? `<div class="oa-ship"><span>🛵 Envío</span><span>${money(o.shippingCost)}</span></div>`
      : "";

    /* Cómo dijo el cliente que va a pagar. Es una DECLARACIÓN, no un cobro:
       el cobro real se registra al aceptar el pedido. */
    let payHtml = "";
    if (o.paymentPref) {
      const esEfectivo = o.paymentPref === "efectivo";
      let txt = esEfectivo ? "💵 Paga en efectivo" : "🏦 Paga por transferencia";
      if (esEfectivo && o.cashHint) {
        const vuelto = o.cashHint - orderTotal(o);
        txt += ` con ${money(o.cashHint)}`;
        if (vuelto >= 0) txt += ` · vuelto ${money(vuelto)}`;
      }
      payHtml = `<div class="oa-pay">${txt}</div>`;
    }

    card.innerHTML = `
      <div class="oa-top">
        <div class="oa-id">Pedido #${o.id} <small>· ${escapeHtml(fmtDateTime(o.createdAt, o.createdAtLabel))}</small></div>
        <span class="oa-badge ${st.cls}">${st.label}</span>
      </div>
      <div class="oa-customer">${escapeHtml(o.customerName || "—")}${waLink}</div>
      <div class="oa-fulfill">${fulfillHtml}</div>
      ${payHtml}
      ${notesHtml}
      <ul class="oa-items">${itemsHtml}</ul>
      ${couponHtml}
      ${shipHtml}
      <div class="oa-total"><span>Total</span><b>${money(orderTotal(o))}</b></div>
    `;

    if (o.status === "pending" && currentRole !== "cocina") {
      const row = document.createElement("div");
      row.className = "oa-confirm-row";

      const field = document.createElement("label");
      field.className = "auth-field";
      field.innerHTML = `<span>Puntos a sumar</span>`;
      const ptsInput = document.createElement("input");
      ptsInput.type = "number";
      ptsInput.min = "0";
      ptsInput.value = String(o.pointsSuggested || 0);
      field.append(ptsInput);

      const payField = document.createElement("label");
      payField.className = "auth-field";
      payField.innerHTML = `<span>Cobro (${money(orderTotal(o))})</span>`;
      const paySelect = document.createElement("select");
      paySelect.innerHTML =
        `<option value="efectivo">💵 Efectivo</option>` +
        `<option value="debito">💳 Débito</option>` +
        `<option value="credito">💳 Crédito</option>` +
        `<option value="qr">📱 QR</option>` +
        `<option value="transfer">🏦 Transferencia</option>` +
        `<option value="">— No registrar cobro</option>`;
      // Si el cliente declaró cómo iba a pagar, viene preseleccionado (igual se
      // puede cambiar: manda lo que realmente pagó, no lo que dijo).
      if (o.paymentPref) {
        paySelect.value = o.paymentPref === "transferencia" ? "transfer" : "efectivo";
      }
      payField.append(paySelect);

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "oa-confirm-btn";
      confirmBtn.textContent = "Confirmar y acreditar ✓";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "oa-cancel-btn";
      cancelBtn.textContent = "Cancelar";

      const lineSt = document.createElement("small");
      lineSt.className = "oa-line-status auth-form-status";

      confirmBtn.addEventListener("click", async () => {
        const points = parseInt(ptsInput.value, 10);
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = "Confirmando…";
        try {
          const r = await api("admin/orders-confirm.php", {
            orderId: o.id,
            points: isNaN(points) ? o.pointsSuggested : points,
            paymentMethod: paySelect.value
          });
          let msg = `✅ Pedido confirmado · +${fmt(r.pointsAwarded)} pts (nuevo saldo: ${fmt(r.newBalance)}).`;
          if (r.paymentRecorded) msg += ` Cobrado en ${METHOD_LABELS[r.paymentMethod] || r.paymentMethod}.`;
          if (r.couponApplied === true) {
            msg += " Cupón canjeado.";
            /* El "2x puntos" multiplica lo acreditado. Conviene decirlo, o el
               número no cierra con lo sugerido y parece un error de carga. */
            if (Number(r.multiplier) > 1) {
              msg += ` Se acreditaron x${Number(r.multiplier)}: ${fmt(r.pointsBase)} → ${fmt(r.pointsAwarded)}.`;
            }
          } else if (r.couponApplied === false) {
            msg += " (El cupón ya no estaba disponible, así que no se aplicó.)";
          }
          setStatus(ordersAdminStatus, msg, "ok");
          loadOrders();
        } catch (error) {
          setStatus(ordersAdminStatus, error.message, "error");
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          confirmBtn.textContent = "Confirmar y acreditar ✓";
        }
      });

      cancelBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        cancelBtn.textContent = "Cancelando…";
        try {
          await api("admin/orders-cancel.php", { orderId: o.id });
          setStatus(ordersAdminStatus, `Pedido #${o.id} cancelado.`, "");
          loadOrders();
        } catch (error) {
          setStatus(ordersAdminStatus, error.message, "error");
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          cancelBtn.textContent = "Cancelar";
        }
      });

      row.append(field, payField, confirmBtn, cancelBtn, lineSt);
      card.append(row);

      // Editar el pedido antes de aceptarlo (agregar lo que el cliente sumó).
      const editToggle = document.createElement("button");
      editToggle.type = "button";
      editToggle.className = "oa-edit-toggle";
      editToggle.textContent = "✏️ Editar pedido";
      let editorEl = null;
      editToggle.addEventListener("click", () => {
        if (editorEl) {
          editorEl.remove();
          editorEl = null;
          editToggle.textContent = "✏️ Editar pedido";
        } else {
          editorEl = buildOrderEditor(o);
          card.append(editorEl);
          editToggle.textContent = "Cerrar edición";
        }
      });
      card.append(editToggle);
    } else if (o.status !== "cancelled") {
      // Pedido aceptado (o más avanzado): mostrar puntos + control de estado.
      /* Con 0 no se dice nada: una venta de mostrador a consumidor final no
         acredita puntos, y "se acreditaron +0" sólo confunde. */
      if (o.pointsAwarded) {
        const p = document.createElement("div");
        p.className = "oa-fulfill";
        p.innerHTML = `🪙 Se acreditaron <b style="color:var(--green)">+${fmt(o.pointsAwarded)}</b> puntos.`;
        card.append(p);
      }
      const next = currentRole !== "cocina" ? nextStage(o.status, o.fulfillment) : null;
      if (next) {
        const row = document.createElement("div");
        row.className = "oa-confirm-row";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "oa-confirm-btn";
        const nextLabel = (ORDER_STATUS[next] || {}).label || next;
        btn.textContent = "Marcar: " + nextLabel;
        const lineSt = document.createElement("small");
        lineSt.className = "oa-line-status auth-form-status";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "Guardando…";
          try {
            await api("admin/orders-status.php", { orderId: o.id, status: next });
            setStatus(ordersAdminStatus, `Pedido #${o.id} → ${nextLabel}.`, "ok");
            loadOrders();
          } catch (error) {
            setStatus(ordersAdminStatus, error.message, "error");
            btn.disabled = false;
            btn.textContent = "Marcar: " + nextLabel;
          }
        });
        row.append(btn, lineSt);
        card.append(row);
      } else if (o.status === "delivered") {
        const d = document.createElement("div");
        d.className = "oa-fulfill";
        d.textContent = "✅ Entregado.";
        card.append(d);
      }
    }

    // Impresión: va derecho a la térmica del local (cola print_jobs, la saca el
    // agente). Si la cola no está disponible (falta la migración, o se está
    // usando el panel desde otro lado), cae al diálogo de impresión del
    // navegador, que es lo que había antes y sigue sirviendo.
    if (o.status !== "cancelled") {
      const pr = document.createElement("div");
      pr.className = "oa-print-row";
      const note = document.createElement("small");
      note.className = "oa-print-note";

      const addPrintBtn = (label, kind) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "oa-print-btn";
        const idle = "🖨️ " + label;
        btn.textContent = idle;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "Enviando…";
          note.className = "oa-print-note";
          note.textContent = "";
          try {
            await api("admin/print-job.php", { orderId: o.id, kind });
            btn.textContent = "✅ " + label;
            note.textContent = "Mandado a la impresora del local.";
            setTimeout(() => { btn.textContent = idle; btn.disabled = false; }, 2500);
          } catch (error) {
            btn.textContent = idle;
            btn.disabled = false;
            if (window.BYRPrint) {
              note.textContent = "La impresora del local no está disponible. Abrimos el diálogo de impresión.";
              window.BYRPrint[kind](o);
            } else {
              note.className = "oa-print-note error";
              note.textContent = error.message;
            }
          }
        });
        pr.append(btn);
      };

      addPrintBtn("Comanda", "comanda");
      if (currentRole !== "cocina") {
        addPrintBtn("Ticket", "ticket");
      }
      pr.append(note);
      card.append(pr);
    }

    return card;
  }

  /* ---------------------------------------------------------
     Pago al delivery
     ---------------------------------------------------------
     Los viajes de la JORNADA (6 a 6, no el día de calendario) y la cuenta
     hecha: cantidad x lo que se le paga por viaje, más el fijo del día.

     Las dos tarifas se guardan en el navegador y no en el servidor: cambian
     seguido y no tienen por qué esperar a un deploy ni a tocar config.php por
     FTP. El número que importa —cuántos viajes hubo— lo cuenta el servidor.
  --------------------------------------------------------- */

  const ddDate    = document.querySelector("[data-dd-date]");
  const ddPrev    = document.querySelector("[data-dd-prev]");
  const ddNext    = document.querySelector("[data-dd-next]");
  const ddPerTrip = document.querySelector("[data-dd-per-trip]");
  const ddDaily   = document.querySelector("[data-dd-daily]");
  const ddPay     = document.querySelector("[data-dd-pay]");
  const ddStatus  = document.querySelector("[data-dd-status]");
  const ddList    = document.querySelector("[data-dd-list]");
  const DD_KEY    = "byr_delivery_pay_v1";
  let ddData = null;

  function ddLoadRates() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(DD_KEY) || "{}") || {}; } catch (e) { /* sin datos */ }
    if (ddPerTrip) ddPerTrip.value = Number(saved.perTrip) > 0 ? saved.perTrip : 490;
    if (ddDaily) ddDaily.value = Number(saved.daily) > 0 ? saved.daily : "";
  }

  function ddSaveRates() {
    try {
      localStorage.setItem(DD_KEY, JSON.stringify({
        perTrip: Number(ddPerTrip && ddPerTrip.value) || 0,
        daily: Number(ddDaily && ddDaily.value) || 0,
      }));
    } catch (e) { /* modo privado: no pasa nada, sólo no se recuerda */ }
  }

  function ddRenderPay() {
    if (!ddPay || !ddData) return;
    const n       = Number(ddData.count) || 0;
    const perTrip = Number(ddPerTrip && ddPerTrip.value) || 0;
    const daily   = Number(ddDaily && ddDaily.value) || 0;
    const viajes  = n * perTrip;

    let html =
      `<div class="dd-line"><span>🛵 Viajes de la jornada</span><span>${fmt(n)}</span></div>` +
      `<div class="dd-line"><span>${fmt(n)} × ${money(perTrip)}</span><span>${money(viajes)}</span></div>`;
    if (daily > 0) {
      html += `<div class="dd-line"><span>Fijo del día</span><span>${money(daily)}</span></div>`;
    }
    html += `<div class="dd-line is-total"><span>A pagar</span><span>${money(viajes + daily)}</span></div>`;

    /* Los envíos realmente cobrados deberían dar lo mismo. Si no dan, hay que
       verlo: cambió el precio del envío, o entró un viaje sin cobrarlo. */
    const cobrado = Number(ddData.shippingTotal) || 0;
    if (n > 0 && cobrado !== viajes) {
      html += `<div class="dd-warn">⚠️ Los envíos cobrados a los clientes suman ${money(cobrado)}, ` +
        `no ${money(viajes)}. Puede que haya cambiado el precio del envío, o que algún viaje ` +
        `haya salido sin cobrarlo.</div>`;
    }
    ddPay.innerHTML = html;
    ddPay.hidden = false;
  }

  function ddRenderList() {
    if (!ddList || !ddData) return;
    const list = ddData.orders || [];
    if (!list.length) {
      ddList.innerHTML = `<p class="dd-empty">No hubo entregas en esta jornada.</p>`;
      return;
    }
    ddList.innerHTML = list.map((o) =>
      `<div class="dd-trip">` +
        `<span class="dd-trip__h">${escapeHtml(o.whenLabel || "")}</span>` +
        `<span class="dd-trip__w">#${o.id} · ${escapeHtml(o.customerName || "")}` +
          `<small class="dd-trip__a">${escapeHtml(o.address || "sin dirección")}</small></span>` +
        `<span>${money(o.shippingCost)}</span>` +
      `</div>`
    ).join("");
  }

  async function loadDeliveryDay() {
    if (!ddDate) return;
    // La cocina no ve plata: se le esconde el bloque entero, como en stats.
    if (currentRole === "cocina") {
      const block = ddDate.closest(".admin-block");
      if (block) block.hidden = true;
      return;
    }
    setStatus(ddStatus, "Cargando…", "");
    try {
      const body = ddDate.value ? { date: ddDate.value } : {};
      ddData = await api("admin/delivery-day.php", body);
      // Sin fecha elegida, el server decide cuál es la jornada en curso.
      if (!ddDate.value && ddData.shift) ddDate.value = ddData.shift.ymd;
      ddRenderPay();
      ddRenderList();
      const s = ddData.shift || {};
      setStatus(ddStatus, `Jornada del ${s.label || "—"} · de ${s.from || "?"} a ${s.to || "?"}.`, "");
    } catch (error) {
      setStatus(ddStatus, error.message, "error");
    }
  }

  function ddShiftDay(days) {
    if (!ddDate || !ddDate.value) return;
    const [y, m, d] = ddDate.value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    ddDate.value = dt.toISOString().slice(0, 10);
    loadDeliveryDay();
  }

  if (ddDate) {
    ddLoadRates();
    ddDate.addEventListener("change", loadDeliveryDay);
    if (ddPrev) ddPrev.addEventListener("click", () => ddShiftDay(-1));
    if (ddNext) ddNext.addEventListener("click", () => ddShiftDay(1));
    [ddPerTrip, ddDaily].forEach((el) => {
      if (el) el.addEventListener("input", () => { ddSaveRates(); ddRenderPay(); });
    });
  }

  /* ---------------------------------------------------------
     Estadísticas: delivery vs. retiro vs. mostrador
  --------------------------------------------------------- */

  const statsGrid   = document.querySelector("[data-stats-grid]");
  const statsPeriod = document.querySelector("[data-stats-period]");
  const statsStatus = document.querySelector("[data-stats-status]");
  let statsData = null;
  let statsRange = "today";

  const STAT_KINDS = [
    { key: "delivery",  label: "🛵 Delivery" },
    { key: "pickup",    label: "🏪 Retiro (take away)" },
    { key: "mostrador", label: "🧾 Mostrador" },
  ];

  async function loadOrderStats() {
    if (!statsGrid) return;
    // La cocina no ve plata facturada: se le esconde el bloque entero.
    if (currentRole === "cocina") {
      const block = statsGrid.closest(".admin-block");
      if (block) block.hidden = true;
      return;
    }
    setStatus(statsStatus, "Cargando…", "");
    try {
      statsData = await api("admin/stats.php", {});
      renderStats();
      setStatus(statsStatus, "", "");
    } catch (error) {
      setStatus(statsStatus, error.message, "error");
    }
  }

  function renderStats() {
    if (!statsGrid || !statsData) return;
    const p = (statsData.periods || {})[statsRange] || {};

    // El porcentaje se calcula sobre los pedidos de la WEB (delivery + retiro),
    // que es la comparación que importa; el mostrador es otro canal.
    const web = (p.delivery ? p.delivery.n : 0) + (p.pickup ? p.pickup.n : 0);

    statsGrid.innerHTML = "";
    STAT_KINDS.forEach((k) => {
      const d = p[k.key] || { n: 0, total: 0 };
      const tile = document.createElement("div");
      tile.className = "stat-tile" + (d.n === 0 ? " is-empty" : "");

      let shareHtml = "";
      if (k.key !== "mostrador" && web > 0) {
        shareHtml = `<div class="st-share">${Math.round((d.n / web) * 100)}% de los pedidos web</div>`;
      }

      tile.innerHTML = `
        <div class="st-label">${k.label}</div>
        <div class="st-n">${fmt(d.n)}</div>
        <div class="st-sub">${money(d.total)} facturado</div>
        ${shareHtml}
      `;
      statsGrid.append(tile);
    });
  }

  if (statsPeriod) {
    statsPeriod.querySelectorAll("[data-stats-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        statsRange = btn.getAttribute("data-stats-range");
        statsPeriod.querySelectorAll("[data-stats-range]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        renderStats();
      });
    });
  }

  /* ---------------------------------------------------------
     Editar un pedido pendiente (agregar/cambiar/quitar ítems)
  --------------------------------------------------------- */

  /* Menú completo para el editor: TODAS las categorías, incluidas las
     hamburguesas (que se agregan con su popup de opciones). */
  let menuForEdit = { categories: [], optionSets: {} };

  async function loadEditableProducts() {
    try {
      const res = await fetch(`${API}menu.php?staff=1`, { credentials: "same-origin" });
      const data = await res.json();
      menuForEdit = {
        categories: Array.isArray(data.categories) ? data.categories : [],
        optionSets: data.optionSets || {},
      };
    } catch (e) {
      menuForEdit = { categories: [], optionSets: {} };
    }
  }

  function findProductBySlug(slug) {
    if (!slug) return null;
    for (const c of menuForEdit.categories) {
      const p = (c.products || []).find((x) => x.slug === slug);
      if (p) return p;
    }
    return null;
  }

  /* ---------------------------------------------------------
     Popup de opciones (papas / bebida / adicionales)

     Mismo criterio que pedir.html y el mostrador: el navegador solo junta qué
     eligieron; el precio real lo recalcula el server con byr_resolve_options().
     Acá el total es solo una vista previa.
  --------------------------------------------------------- */

  /**
   * Reconstruye qué opciones tenía una línea a partir del texto guardado.
   *
   * En `order_items` se guarda el texto ("Simples · Coca-Cola · 📝 sin cebolla"),
   * no los ids. Para poder abrir el popup con lo que el cliente ya había
   * elegido, se parte ese texto por sus separadores y se comparan los pedazos
   * con los nombres de las opciones. Se compara el pedazo ENTERO, no "que
   * contenga": si no, "Extra cheddar" engancharía con "Cheddar para hamburguesa".
   */
  function parseChosenOptions(optionsText, groups) {
    const raw = String(optionsText || "");
    const noteIdx = raw.indexOf("📝");
    const optsPart = noteIdx >= 0 ? raw.slice(0, noteIdx) : raw;
    const note = noteIdx >= 0
      ? raw.slice(noteIdx + 2).replace(/^\s*·?\s*/, "").trim()
      : "";

    /* Cada pedazo puede traer cantidad: "Cheddar para hamburguesa x2". */
    const segments = optsPart.split(/[·,]/).map((s) => s.trim()).filter(Boolean)
      .map((seg) => {
        const m = seg.match(/^(.*?)\s+x(\d+)$/);
        return m
          ? { name: m[1].trim(), qty: Math.max(1, parseInt(m[2], 10) || 1) }
          : { name: seg, qty: 1 };
      });

    const chosen = {};
    groups.forEach((g) => {
      g.options.forEach((o) => {
        const hit = segments.find((s) => s.name === o.name);
        if (!hit) return;
        if (g.type === "single") {
          chosen[g.id] = o.id;
        } else {
          chosen[g.id] = chosen[g.id] || {};
          chosen[g.id][o.id] = hit.qty;
        }
      });
    });
    return { chosen, note };
  }

  /**
   * Qué opciones muestra el PANEL para un producto.
   *
   * Al pedir, solo las hamburguesas abren opciones. Editando desde el panel se
   * muestran igual para todo (set 'staff': los mismos adicionales, pero nada
   * obligatorio), así se le puede sumar una feta de cheddar a unas papas.
   */
  function editorSetKey(product) {
    return product.optionSet || "staff";
  }

  function editorGroups(product) {
    return menuForEdit.optionSets[editorSetKey(product)] || [];
  }

  function openOptionsPopup({ product, confirmLabel, withQty, preset, onConfirm }) {
    const groups = editorGroups(product);

    const overlay = document.createElement("div");
    overlay.className = "oa-opt-overlay";
    const card = document.createElement("div");
    card.className = "oa-opt-card";
    overlay.append(card);

    const head = document.createElement("div");
    head.className = "oa-opt-head";
    head.innerHTML = `<b>${escapeHtml(product.name)}</b><span>${money(product.price)}</span>`;
    card.append(head);

    /* Cantidades de los adicionales: { grupo: { opción: cuántas } }.
       Los "single" (papas, bebida) siguen viviendo en los radios del DOM;
       los "multi" necesitan un número, así que se llevan acá. */
    const multiQty = {};
    groups.forEach((g) => {
      if (g.type === "single") return;
      const prev = (preset && preset.chosen[g.id]) || {};
      multiQty[g.id] = {};
      g.options.forEach((o) => { multiQty[g.id][o.id] = Number(prev[o.id]) || 0; });
    });

    groups.forEach((g) => {
      const gEl = document.createElement("div");
      gEl.className = "oa-opt-group";
      const h = document.createElement("div");
      h.className = "oa-opt-title";
      h.textContent = g.title + (g.required ? " *" : "");
      gEl.append(h);

      g.options.forEach((o, i) => {
        const price = document.createElement("span");
        price.className = "oa-opt-price";
        price.textContent = o.price ? "+" + money(o.price) : "";
        const nm = document.createElement("span");
        nm.className = "oa-opt-name";
        nm.textContent = o.name;

        if (g.type === "single") {
          const lab = document.createElement("label");
          lab.className = "oa-opt-row";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "oaopt_" + g.id;
          input.value = o.id;
          if (preset) {
            // Editando: arranca con lo que la línea ya tenía, para que abrir
            // el lápiz a escribir una aclaración no borre papas ni bebida.
            input.checked = preset.chosen[g.id] === o.id;
          } else if (g.required && i === 0) {
            // Agregando: los obligatorios vienen con la primera (la de $0)
            // marcada, así sumar algo simple es un clic y listo.
            input.checked = true;
          }
          input.addEventListener("change", paintTotal);
          lab.append(input, nm, price);
          gEl.append(lab);
          return;
        }

        /* Adicionales: con cantidad, para pedir dos fetas de cheddar. */
        const row = document.createElement("div");
        row.className = "oa-opt-row";
        const step = document.createElement("div");
        step.className = "oa-opt-step";
        const num = document.createElement("span");
        num.className = "oa-opt-stepnum";

        const paintQty = () => {
          const n = multiQty[g.id][o.id];
          num.textContent = String(n);
          row.classList.toggle("is-on", n > 0);
        };
        const bump = (d) => {
          const n = Math.max(0, Math.min(20, multiQty[g.id][o.id] + d));
          multiQty[g.id][o.id] = n;
          paintQty();
          paintTotal();
        };

        const minus = document.createElement("button");
        minus.type = "button";
        minus.className = "oa-step-btn";
        minus.textContent = "−";
        minus.addEventListener("click", () => bump(-1));
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "oa-step-btn";
        plus.textContent = "+";
        plus.addEventListener("click", () => bump(1));

        step.append(minus, num, plus);
        row.append(nm, price, step);
        paintQty();
        gEl.append(row);
      });
      card.append(gEl);
    });

    /* Red de seguridad: si es un pedido viejo del que no se pudo reconocer la
       opción obligatoria, se marca la primera. Sin esto el server rechazaría
       el guardado con "Falta elegir" y el cajero no entendería por qué. */
    groups.forEach((g) => {
      if (g.type !== "single" || !g.required) return;
      const inputs = card.querySelectorAll(`input[name="oaopt_${g.id}"]`);
      if (inputs.length && !Array.from(inputs).some((i) => i.checked)) {
        inputs[0].checked = true;
      }
    });

    const noteWrap = document.createElement("div");
    noteWrap.className = "oa-opt-group";
    noteWrap.innerHTML = '<div class="oa-opt-title">Aclaración (opcional)</div>';
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.className = "oa-opt-note";
    noteInput.placeholder = "ej: sin cebolla, sin hielo, para llevar";
    noteInput.maxLength = 200;
    if (preset && preset.note) noteInput.value = preset.note;
    noteWrap.append(noteInput);
    card.append(noteWrap);

    const qtyInput = document.createElement("input");
    if (withQty) {
      const qWrap = document.createElement("div");
      qWrap.className = "oa-opt-group oa-opt-qty";
      qWrap.innerHTML = '<div class="oa-opt-title">Cantidad</div>';
      qtyInput.type = "number";
      qtyInput.min = "1";
      qtyInput.max = "50";
      qtyInput.value = "1";
      qtyInput.addEventListener("input", paintTotal);
      qWrap.append(qtyInput);
      card.append(qWrap);
    }

    const foot = document.createElement("div");
    foot.className = "oa-opt-foot";
    const totalEl = document.createElement("div");
    totalEl.className = "oa-opt-total";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "oa-opt-cancel";
    cancelBtn.textContent = "Cancelar";
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "oa-opt-ok";
    okBtn.textContent = confirmLabel || "Agregar";
    foot.append(totalEl, cancelBtn, okBtn);
    card.append(foot);

    /* Los adicionales con cantidad se mandan REPETIDOS: dos fetas de cheddar
       viajan como ["cheddar","cheddar"]. El server cuenta las repeticiones,
       cobra cada una y las escribe como "Cheddar para hamburguesa x2". */
    function collect() {
      const out = {};
      groups.forEach((g) => {
        if (g.type === "single") {
          const marked = Array.from(card.querySelectorAll(`input[name="oaopt_${g.id}"]`))
            .find((i) => i.checked);
          if (marked) out[g.id] = marked.value;
          return;
        }
        const list = [];
        g.options.forEach((o) => {
          const n = multiQty[g.id][o.id] || 0;
          for (let k = 0; k < n; k++) list.push(o.id);
        });
        if (list.length) out[g.id] = list;
      });
      return out;
    }

    function optionsDelta() {
      let delta = 0;
      groups.forEach((g) => {
        if (g.type === "single") {
          const marked = Array.from(card.querySelectorAll(`input[name="oaopt_${g.id}"]`))
            .find((i) => i.checked);
          const o = marked && g.options.find((x) => x.id === marked.value);
          if (o) delta += Number(o.price) || 0;
          return;
        }
        g.options.forEach((o) => {
          delta += (Number(o.price) || 0) * (multiQty[g.id][o.id] || 0);
        });
      });
      return delta;
    }

    function paintTotal() {
      const qty = withQty ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
      totalEl.textContent = money((product.price + optionsDelta()) * qty);
    }

    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    okBtn.addEventListener("click", () => {
      const qty = withQty ? Math.max(1, Math.min(50, parseInt(qtyInput.value, 10) || 1)) : 1;
      close();
      onConfirm({ options: collect(), note: noteInput.value.trim(), qty });
    });

    paintTotal();
    document.body.append(overlay);
  }

  function miniBtn(txt, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "oa-mini-btn";
    b.textContent = txt;
    b.addEventListener("click", fn);
    return b;
  }

  async function editOrder(body) {
    try {
      await api("admin/order-edit.php", body);
      loadOrders();
    } catch (error) {
      setStatus(ordersAdminStatus, error.message, "error");
    }
  }

  function buildOrderEditor(o) {
    const box = document.createElement("div");
    box.className = "oa-editor";

    (o.items || []).forEach((ln) => {
      const r = document.createElement("div");
      r.className = "oa-edit-item";
      const nm = document.createElement("span");
      nm.className = "oa-edit-name";
      nm.textContent = ln.name + (ln.options ? " (" + ln.options + ")" : "");
      const ctl = document.createElement("div");
      ctl.className = "oa-edit-qty";

      /* Lápiz en TODAS las líneas: en las hamburguesas para corregir papas,
         bebida y adicionales; en una gaseosa o unas papas, para dejarle una
         aclaración a la cocina ("sin hielo"). El popup abre con lo que la
         línea ya tenía, así editar una cosa no pisa las otras. */
      const prod = findProductBySlug(ln.productSlug);
      if (prod) {
        const groups = editorGroups(prod);
        ctl.append(miniBtn("✏️", () => {
          openOptionsPopup({
            product: prod,
            confirmLabel: "Guardar",
            withQty: false,
            preset: parseChosenOptions(ln.options, groups),
            onConfirm: (sel) => editOrder({
              orderId: o.id, action: "setItemOptions", itemId: ln.id,
              options: sel.options, note: sel.note,
            }),
          });
        }));
      }

      ctl.append(
        miniBtn("−", () => editOrder({ orderId: o.id, action: "setItemQty", itemId: ln.id, qty: ln.qty - 1 })),
        Object.assign(document.createElement("span"), { className: "oa-edit-num", textContent: String(ln.qty) }),
        miniBtn("+", () => editOrder({ orderId: o.id, action: "setItemQty", itemId: ln.id, qty: ln.qty + 1 }))
      );
      r.append(nm, ctl);
      box.append(r);
    });

    /* --- Agregar: TODO el menú, agrupado por categoría --- */
    const add = document.createElement("div");
    add.className = "oa-edit-add";
    const sel = document.createElement("select");
    sel.className = "oa-edit-select";

    let optionsHtml = '<option value="">➕ Agregar del menú…</option>';
    menuForEdit.categories.forEach((c) => {
      const prods = c.products || [];
      if (!prods.length) return;
      optionsHtml += `<optgroup label="${escapeHtml(c.label)}">` +
        prods.map((p) =>
          `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.name)} · ${money(p.price)}${p.optionSet ? " ⚙️" : ""}</option>`
        ).join("") +
        "</optgroup>";
    });
    sel.innerHTML = optionsHtml;

    /* Todo pasa por el popup: así cualquier producto puede llevar adicionales,
       cantidad y aclaración. En los que no son hamburguesas no hay nada
       obligatorio, así que confirmar es un solo clic. */
    const addBtn = miniBtn("Agregar", () => {
      const p = findProductBySlug(sel.value);
      if (!p) return;
      openOptionsPopup({
        product: p,
        confirmLabel: "Agregar",
        withQty: true,
        onConfirm: (choice) => editOrder({
          orderId: o.id, action: "addItem", slug: p.slug,
          qty: choice.qty, options: choice.options, note: choice.note,
        }),
      });
    });
    add.append(sel, addBtn);
    box.append(add);

    const hint = document.createElement("small");
    hint.className = "oa-edit-hint";
    hint.textContent = "Se puede agregar cualquier cosa del menú (⚙️ = abre sus opciones). Con ✏️ cambiás opciones o le dejás una aclaración a la cocina.";
    box.append(hint);
    return box;
  }

  /**
   * Fecha y hora para mostrar.
   *
   * Si el servidor mandó la etiqueta ya hecha (`...Label`), se usa esa y listo:
   * viene en hora de Argentina. La cuenta de acá abajo es el respaldo para los
   * endpoints que todavía no la mandan — y es la que tenía el error de las 3
   * horas: `new Date("2026-08-27T23:33:00")` sin zona lo toma como hora local,
   * pero la base guarda en UTC, así que un pedido de las 20:33 salía 23:33.
   * Por eso el respaldo ahora lo lee como UTC y lo pasa a Argentina.
   *
   * Las partes se arman a mano y no con toLocaleString: el locale es-AR
   * ignora el "2-digit" del mes y devuelve 27/8 en vez de 27/08.
   */
  function argParts(value) {
    const d = new Date(String(value).replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return null;
    const out = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).forEach((x) => { out[x.type] = x.value; });
    return out;
  }

  function fmtDateTime(value, label) {
    if (label) return label;
    if (!value) return "";
    const p = argParts(value);
    if (!p) return String(value);
    return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
  }

  function initOrders() {
    if (!ordersList) return;
    if (ordersFilter) {
      ordersFilter.querySelectorAll("[data-orders-status]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ordersFilterStatus = btn.getAttribute("data-orders-status");
          ordersFilter.querySelectorAll("[data-orders-status]").forEach((b) => {
            b.classList.toggle("is-active", b === btn);
          });
          loadOrders();
        });
      });
    }
    if (ordersRefresh) ordersRefresh.addEventListener("click", loadOrders);
    // Recargar la lista cada vez que se ENTRA a la pestaña Pedidos, así no
    // queda "vieja" si el admin dejó el panel abierto y llegó un pedido nuevo.
    const pedidosTabBtn = document.querySelector('[data-tab-btn="pedidos"]');
    if (pedidosTabBtn) {
      pedidosTabBtn.addEventListener("click", () => {
        loadOrders();
        if (newOrderBox) newOrderBox.hidden = true; // ya lo vio
      });
    }

    /* --- Campanita --- */
    paintBellToggle();
    if (bellToggle) {
      bellToggle.addEventListener("click", () => {
        bellOn = !bellOn;
        localStorage.setItem(BELL_KEY, bellOn ? "1" : "0");
        paintBellToggle();
        // Al prenderla suena una vez: sirve de prueba y, de paso, destraba el
        // audio del navegador (que exige un clic antes de dejar sonar nada).
        if (bellOn) playBell();
      });
    }
    if (newOrderSee) {
      newOrderSee.addEventListener("click", () => {
        newOrderBox.hidden = true;
        if (pedidosTabBtn) pedidosTabBtn.click();
        loadOrders();
      });
    }
    startOrdersPolling();

    loadEditableProducts(); // productos para el editor de pedidos pendientes
    loadOrders();
    loadOrderStats();
    loadDeliveryDay();
  }

  /* ---------------------------------------------------------
     Menú — editar precios y disponibilidad
  --------------------------------------------------------- */

  const menuAdminList = document.querySelector("[data-menu-admin-list]");
  const menuAdminStatus = document.querySelector("[data-menu-admin-status]");

  /* Las ocho categorias que acepta api/admin/product-save.php. Antes faltaban
     promos, entradas y postres: esos productos mostraban el slug crudo. */
  const CAT_LABEL = {
    promos: "Promos", entradas: "Entradas", hamburguesas: "Hamburguesas",
    combos: "Combos", papas: "Papas", postres: "Postres",
    bebidas: "Bebidas", otros: "Otros"
  };

  /* Juegos de opciones disponibles, tal como los manda el servidor. */
  let OPTION_SETS = {};
  let OPTION_SET_READY = false;

  async function loadMenuAdmin() {
    if (!menuAdminList) return;
    setStatus(menuAdminStatus, "Cargando menú…", "");
    menuAdminList.innerHTML = "";
    try {
      const res = await fetch(`${API}admin/products-list.php`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el menú.");
      /* Los juegos de opciones los define el servidor (menu-options.php): el
         panel solo los dibuja. Si falta la migración vienen apagados y el
         desplegable ni se muestra. */
      OPTION_SETS = data.optionSets || {};
      OPTION_SET_READY = Boolean(data.optionSetReady);
      renderMenuAdmin(data.products || []);
      setStatus(menuAdminStatus, "", "");
    } catch (error) {
      setStatus(menuAdminStatus, error.message, "error");
    }
  }

  const menuNewBtn    = document.querySelector("[data-menu-new]");
  const menuNewForm   = document.querySelector("[data-menu-new-form]");
  const menuCount     = document.querySelector("[data-menu-count]");
  const newName       = document.querySelector("[data-new-name]");
  const newCategory   = document.querySelector("[data-new-category]");
  const newPrice      = document.querySelector("[data-new-price]");
  const newEmoji      = document.querySelector("[data-new-emoji]");
  const newSort       = document.querySelector("[data-new-sort]");
  const newDesc       = document.querySelector("[data-new-description]");
  const newAvailable  = document.querySelector("[data-new-available]");
  const newSaveBtn    = document.querySelector("[data-new-save]");
  const newCancelBtn  = document.querySelector("[data-new-cancel]");
  const newStatus     = document.querySelector("[data-new-status]");
  const newOptSetFld  = document.querySelector("[data-new-optionset-field]");
  const newOptSet     = document.querySelector("[data-new-optionset]");

  function renderMenuAdmin(products) {
    menuAdminList.innerHTML = "";
    if (menuCount) {
      const enCarta = products.filter((p) => p.available).length;
      menuCount.textContent = products.length + " productos · " + enCarta + " en la carta";
    }
    if (!products.length) {
      menuAdminList.innerHTML = `<p class="oa-empty">Todavía no hay productos. Corré la migración 2026-08-orders.sql.</p>`;
      return;
    }
    products.forEach((p) => menuAdminList.append(productAdminRow(p)));
  }

  /* =========================================================
     Alta de producto

     El endpoint (api/admin/product-save.php) crea cuando no le mandás un id,
     y arma el identificador interno solo a partir del nombre. Por eso el
     formulario no pide slug: si el que sale ya existe, el servidor avisa.
  ========================================================= */


  function fillCategorySelect() {
    /* El desplegable de opciones solo aparece si está corrida su migración:
       no ofrecemos algo que no se va a poder guardar. */
    if (newOptSetFld) newOptSetFld.hidden = !OPTION_SET_READY;
    if (newOptSet && !newOptSet.options.length) {
      Object.keys(OPTION_SETS).forEach((key) => {
        const o = document.createElement("option");
        o.value = key;
        o.textContent = OPTION_SETS[key];
        newOptSet.append(o);
      });
    }

    if (!newCategory || newCategory.options.length) return;
    Object.keys(CAT_LABEL).forEach((slug) => {
      const o = document.createElement("option");
      o.value = slug;
      o.textContent = CAT_LABEL[slug];
      newCategory.append(o);
    });
    newCategory.value = "hamburguesas";
  }

  function clearNewForm() {
    if (!menuNewForm) return;
    newName.value = "";
    newPrice.value = "";
    newEmoji.value = "";
    newSort.value = "";
    newDesc.value = "";
    newAvailable.checked = true;
    newCategory.value = "hamburguesas";
    newStatus.textContent = "";
  }

  function toggleNewForm(open) {
    if (!menuNewForm) return;
    fillCategorySelect();
    menuNewForm.hidden = !open;
    menuNewBtn.textContent = open ? "✕ Cerrar" : "➕ Nuevo producto";
    if (open) newName.focus();
    else clearNewForm();
  }

  if (menuNewBtn) {
    menuNewBtn.addEventListener("click", () => toggleNewForm(menuNewForm.hidden));
  }
  if (newCancelBtn) {
    newCancelBtn.addEventListener("click", () => toggleNewForm(false));
  }

  if (newSaveBtn) {
    newSaveBtn.addEventListener("click", async () => {
      const name = newName.value.trim();
      const price = parseInt(newPrice.value, 10);

      if (!name) {
        newStatus.textContent = "Poné un nombre.";
        newStatus.style.color = "#ffb0b0";
        newName.focus();
        return;
      }
      if (isNaN(price) || price < 0) {
        newStatus.textContent = "Poné un precio válido.";
        newStatus.style.color = "#ffb0b0";
        newPrice.focus();
        return;
      }

      newSaveBtn.disabled = true;
      newSaveBtn.textContent = "Creando…";
      newStatus.textContent = "";

      try {
        await api("admin/product-save.php", {
          category: newCategory.value,
          name,
          description: newDesc.value.trim(),
          emoji: newEmoji.value.trim(),
          price,
          available: newAvailable.checked,
          sort: parseInt(newSort.value, 10) || 0,
          optionSet: newOptSet ? newOptSet.value : ""
        });

        toggleNewForm(false);
        setStatus(menuAdminStatus, "✅ " + name + " agregado al menú.", "ok");
        loadMenuAdmin();   /* recargamos para verlo en su lugar */
      } catch (error) {
        newStatus.textContent = error.message;
        newStatus.style.color = "#ffb0b0";
      } finally {
        newSaveBtn.disabled = false;
        newSaveBtn.textContent = "Crear producto";
      }
    });
  }

  /* Campos que se editan en el panel de detalle. La fila compacta se queda
     con lo que se toca a diario (precio y disponible); el resto vive acá
     para no llenarla de campos que casi nunca se usan. */
  function maField(label, el, wide) {
    const l = document.createElement("label");
    l.className = "ma-field" + (wide ? " ma-field-wide" : "");
    const s = document.createElement("span");
    s.textContent = label;
    l.append(s, el);
    return l;
  }

  /* Desplegable de "¿qué opciones abre este producto?". Las opciones las manda
     el servidor, así que agregar un juego nuevo en menu-options.php lo hace
     aparecer acá sin tocar el panel. */
  function optionSetSelect(selected) {
    const sel = document.createElement("select");
    Object.keys(OPTION_SETS).forEach((key) => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = OPTION_SETS[key];
      if (key === (selected || "")) o.selected = true;
      sel.append(o);
    });
    return sel;
  }

  function categorySelect(selected) {
    const sel = document.createElement("select");
    Object.keys(CAT_LABEL).forEach((slug) => {
      const o = document.createElement("option");
      o.value = slug;
      o.textContent = CAT_LABEL[slug];
      if (slug === selected) o.selected = true;
      sel.append(o);
    });
    return sel;
  }

  function productAdminRow(p) {
    const row = document.createElement("div");
    row.className = "ma-row";

    const emoji = document.createElement("span");
    emoji.className = "ma-emoji";
    emoji.textContent = p.emoji || "🍔";

    const info = document.createElement("div");
    info.className = "ma-info";
    const nameEl = document.createElement("div");
    nameEl.className = "ma-name";
    nameEl.textContent = p.name;
    const catEl = document.createElement("div");
    catEl.className = "ma-cat";
    catEl.textContent = CAT_LABEL[p.category] || p.category;
    info.append(nameEl, catEl);

    const priceField = document.createElement("div");
    priceField.className = "ma-price-field";
    const sign = document.createElement("span");
    sign.textContent = "$";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.value = String(p.price);
    priceField.append(sign, priceInput);

    const availLabel = document.createElement("label");
    availLabel.className = "ma-avail";
    const availCheck = document.createElement("input");
    availCheck.type = "checkbox";
    availCheck.checked = !!p.available;
    availLabel.append(availCheck, document.createTextNode(" En la carta"));

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ma-save";
    saveBtn.textContent = "Guardar";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ma-edit-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "Editar nombre, descripción, categoría y orden";
    editBtn.setAttribute("aria-label", "Editar el resto del producto");

    const rowSt = document.createElement("small");
    rowSt.className = "ma-row-status";

    /* --- Panel de detalle --- */
    const details = document.createElement("div");
    details.className = "ma-details";
    details.hidden = true;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = p.name || "";

    const catSelect = categorySelect(p.category);

    const emojiInput = document.createElement("input");
    emojiInput.type = "text";
    emojiInput.maxLength = 4;
    emojiInput.value = p.emoji || "";

    const sortInput = document.createElement("input");
    sortInput.type = "number";
    sortInput.step = "10";
    sortInput.value = String(p.sort ?? 0);

    const descInput = document.createElement("textarea");
    descInput.rows = 2;
    descInput.value = p.description || "";

    const grid = document.createElement("div");
    grid.className = "ma-grid";
    grid.append(
      maField("Nombre", nameInput),
      maField("Categoría", catSelect),
      maField("Emoji", emojiInput),
      maField("Orden", sortInput)
    );

    const slugHint = document.createElement("p");
    slugHint.className = "ma-hint";
    slugHint.textContent = "Identificador interno: " + p.slug + " (no se cambia: lo usan los pedidos viejos)";


    /* Solo si está corrida la migración: si no, no ofrecemos algo que no se
       va a poder guardar. */
    const optSetSelect = optionSetSelect(p.optionSet);
    if (OPTION_SET_READY) {
      grid.append(maField("¿Qué opciones abre?", optSetSelect));
    }
    details.append(grid, maField("Descripción", descInput, true), slugHint);

    editBtn.addEventListener("click", () => {
      details.hidden = !details.hidden;
      editBtn.classList.toggle("is-open", !details.hidden);
    });

    saveBtn.addEventListener("click", async () => {
      const price = parseInt(priceInput.value, 10);
      if (isNaN(price) || price < 0) {
        rowSt.textContent = "Precio inválido.";
        rowSt.style.color = "#ffb0b0";
        return;
      }
      const name = nameInput.value.trim();
      if (!name) {
        rowSt.textContent = "El producto necesita un nombre.";
        rowSt.style.color = "#ffb0b0";
        details.hidden = false;
        editBtn.classList.add("is-open");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Guardando…";
      try {
        await api("admin/product-save.php", {
          id: p.id,
          slug: p.slug,
          category: catSelect.value,
          name,
          description: descInput.value.trim(),
          image: p.image,
          emoji: emojiInput.value.trim(),
          price,
          available: availCheck.checked,
          sort: parseInt(sortInput.value, 10) || 0,
          optionSet: optSetSelect.value
        });

        /* Nos quedamos con lo guardado, para que la fila refleje la verdad
           sin tener que recargar toda la lista. */
        p.price = price;
        p.available = availCheck.checked;
        p.name = name;
        p.category = catSelect.value;
        p.emoji = emojiInput.value.trim();
        p.description = descInput.value.trim();
        p.sort = parseInt(sortInput.value, 10) || 0;
        p.optionSet = optSetSelect.value;

        nameEl.textContent = p.name;
        catEl.textContent = CAT_LABEL[p.category] || p.category;
        emoji.textContent = p.emoji || "🍔";

        rowSt.textContent = "✅ Guardado.";
        rowSt.style.color = "#7bffa0";
      } catch (error) {
        rowSt.textContent = error.message;
        rowSt.style.color = "#ffb0b0";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Guardar";
      }
    });

    row.append(emoji, info, priceField, availLabel, saveBtn, editBtn, rowSt, details);
    return row;
  }

  /* ---------------------------------------------------------
     Caja (POS Fase 1) — apertura, cobros, movimientos, cierre
  --------------------------------------------------------- */

  const cajaPanel = document.querySelector("[data-caja-panel]");
  const cajaMsg = document.querySelector("[data-caja-msg]");
  const cajaHist = document.querySelector("[data-caja-hist]");
  const cajaHistMsg = document.querySelector("[data-caja-hist-msg]");

  const METHOD_LABELS = {
    efectivo: "Efectivo", debito: "Débito", credito: "Crédito",
    qr: "QR", transfer: "Transferencia"
  };

  async function loadCaja() {
    if (!cajaPanel) return;
    setStatus(cajaMsg, "Cargando caja…", "");
    try {
      const res = await fetch(`${API}admin/caja-status.php`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la caja.");
      setStatus(cajaMsg, "", "");
      if (data.ready === false) {
        cajaPanel.innerHTML = `<div class="caja-block">⚙️ Falta correr la migración <b>2026-08-caja.sql</b> en phpMyAdmin para activar la caja.</div>`;
        return;
      }
      if (data.open) renderCajaOpen(data.session, data.totals);
      else renderCajaClosed();
      loadCajaHistory();
    } catch (error) {
      setStatus(cajaMsg, error.message, "error");
    }
  }

  async function loadCajaHistory() {
    if (!cajaHist) return;
    setStatus(cajaHistMsg, "Cargando historial…", "");
    try {
      const res = await fetch(`${API}admin/caja-history.php`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      setStatus(cajaHistMsg, "", "");
      renderCajaHistory(data.sessions || []);
    } catch (error) {
      setStatus(cajaHistMsg, error.message, "error");
    }
  }

  function renderCajaHistory(sessions) {
    if (!sessions.length) {
      cajaHist.innerHTML = `<p class="oa-empty">Todavía no hay cierres de caja.</p>`;
      return;
    }
    cajaHist.innerHTML = sessions.map((s) => {
      const diff = s.difference;
      const diffTxt = diff === null ? "—"
        : (diff === 0 ? "✅ Sin diferencia"
          : (diff > 0 ? `▲ Sobra ${money(diff)}` : `▼ Falta ${money(-diff)}`));
      const diffCls = diff === null || diff === 0 ? "" : (diff > 0 ? "caja-diff-up" : "caja-diff-down");
      return `
        <div class="caja-block caja-hist-card">
          <div class="caja-hist-head">
            <span>Turno #${s.id}</span>
            <span class="caja-hist-diff ${diffCls}">${diffTxt}</span>
          </div>
          <div class="caja-hist-when">${escapeHtml(fmtDateTime(s.openedAt, s.openedAtLabel))} → ${escapeHtml(fmtDateTime(s.closedAt, s.closedAtLabel))}${s.closedBy ? " · " + escapeHtml(s.closedBy) : ""}</div>
          ${methodRows(s.byMethod)}
          <div class="caja-line caja-line-total"><span>Total ventas</span><b>${money(s.salesTotal)}</b></div>
          <div class="caja-line"><span>Efectivo esperado</span><b>${s.expectedCash === null ? "—" : money(s.expectedCash)}</b></div>
          <div class="caja-line"><span>Efectivo contado</span><b>${s.countedCash === null ? "—" : money(s.countedCash)}</b></div>
        </div>`;
    }).join("");
  }

  function renderCajaClosed() {
    cajaPanel.innerHTML = `
      <div class="caja-state">
        <div class="caja-badge caja-badge-off">● Caja cerrada</div>
        <label class="auth-field">
          <span>Fondo inicial <small>(efectivo con el que arrancás)</small></span>
          <input type="number" min="0" inputmode="numeric" placeholder="Ej: 20000" data-caja-float>
        </label>
        <button type="button" class="auth-submit" data-caja-open-btn>Abrir caja 💵</button>
      </div>`;
    cajaPanel.querySelector("[data-caja-open-btn]").addEventListener("click", openCaja);
  }

  async function openCaja() {
    const openingFloat = parseInt(cajaPanel.querySelector("[data-caja-float]").value, 10) || 0;
    const btn = cajaPanel.querySelector("[data-caja-open-btn]");
    btn.disabled = true; btn.textContent = "Abriendo…";
    try {
      await api("admin/caja-open.php", { openingFloat });
      setStatus(cajaMsg, "✅ Caja abierta.", "ok");
      loadCaja();
    } catch (error) {
      setStatus(cajaMsg, error.message, "error");
      btn.disabled = false; btn.textContent = "Abrir caja 💵";
    }
  }

  function methodRows(byMethod) {
    return Object.keys(METHOD_LABELS).map((m) =>
      `<div class="caja-line"><span>${METHOD_LABELS[m]}</span><b>${money(byMethod[m] || 0)}</b></div>`
    ).join("");
  }

  function renderCajaOpen(session, totals) {
    cajaPanel.innerHTML = `
      <div class="caja-state">
        <div class="caja-badge caja-badge-on">● Caja abierta</div>
        <div class="caja-meta">Abierta ${escapeHtml(fmtDateTime(session.openedAt, session.openedAtLabel))} · Fondo inicial <b>${money(session.openingFloat)}</b></div>

        <div class="caja-block">
          <h3>Ventas del turno (X)</h3>
          ${methodRows(totals.byMethod)}
          <div class="caja-line caja-line-total"><span>Total ventas</span><b>${money(totals.salesTotal)}</b></div>
          <div class="caja-line"><span>Ingresos de caja</span><b>${money(totals.cashIn)}</b></div>
          <div class="caja-line"><span>Egresos de caja</span><b>- ${money(totals.cashOut)}</b></div>
          <div class="caja-line caja-line-total"><span>Efectivo esperado</span><b>${money(totals.expectedCash)}</b></div>
        </div>

        <div class="caja-block">
          <h3>Movimiento de efectivo</h3>
          <div class="admin-grid2">
            <label class="auth-field"><span>Tipo</span>
              <select data-mov-type>
                <option value="out">Egreso (sale plata)</option>
                <option value="in">Ingreso (entra plata)</option>
              </select>
            </label>
            <label class="auth-field"><span>Monto</span>
              <input type="number" min="1" inputmode="numeric" placeholder="Ej: 5000" data-mov-amount>
            </label>
          </div>
          <label class="auth-field"><span>Motivo <small>(opcional)</small></span>
            <input type="text" placeholder="Ej: pago proveedor" data-mov-reason>
          </label>
          <button type="button" class="admin-btn-inline" data-mov-btn>Registrar movimiento</button>
        </div>

        <div class="caja-block">
          <h3>Cerrar caja (arqueo)</h3>
          <label class="auth-field"><span>Efectivo contado a mano <small>(opcional)</small></span>
            <input type="number" min="0" inputmode="numeric" placeholder="Ej: ${totals.expectedCash}" data-caja-counted>
          </label>
          <button type="button" class="auth-submit" data-caja-close-btn>Cerrar caja y ver Z 🔒</button>
        </div>
      </div>`;
    cajaPanel.querySelector("[data-mov-btn]").addEventListener("click", addMovement);
    cajaPanel.querySelector("[data-caja-close-btn]").addEventListener("click", closeCaja);
  }

  async function addMovement() {
    const type = cajaPanel.querySelector("[data-mov-type]").value;
    const amount = parseInt(cajaPanel.querySelector("[data-mov-amount]").value, 10) || 0;
    const reason = cajaPanel.querySelector("[data-mov-reason]").value.trim();
    if (amount <= 0) { setStatus(cajaMsg, "Poné un monto mayor a cero.", "error"); return; }
    const btn = cajaPanel.querySelector("[data-mov-btn]");
    btn.disabled = true; btn.textContent = "Registrando…";
    try {
      await api("admin/caja-movement.php", { type, amount, reason });
      setStatus(cajaMsg, "✅ Movimiento registrado.", "ok");
      loadCaja();
    } catch (error) {
      setStatus(cajaMsg, error.message, "error");
      btn.disabled = false; btn.textContent = "Registrar movimiento";
    }
  }

  async function closeCaja() {
    const countedRaw = cajaPanel.querySelector("[data-caja-counted]").value;
    const btn = cajaPanel.querySelector("[data-caja-close-btn]");
    btn.disabled = true; btn.textContent = "Cerrando…";
    try {
      const body = countedRaw === "" ? {} : { countedCash: parseInt(countedRaw, 10) || 0 };
      const r = await api("admin/caja-close.php", body);
      renderZ(r.z, r.printed);
      setStatus(cajaMsg, "✅ Caja cerrada.", "ok");
    } catch (error) {
      setStatus(cajaMsg, error.message, "error");
      btn.disabled = false; btn.textContent = "Cerrar caja y ver Z 🔒";
    }
  }

  // `printed` viene del cierre: true si el Z quedó encolado en la térmica.
  // Undefined cuando el Z se re-renderiza por otro motivo (ahí no se dice nada,
  // que es distinto de decir que no se imprimió).
  function renderZ(z, printed) {
    const diffTxt = z.difference === null
      ? "—"
      : (z.difference === 0 ? "✅ Sin diferencia"
        : (z.difference > 0 ? `▲ Sobra ${money(z.difference)}` : `▼ Falta ${money(-z.difference)}`));

    cajaPanel.innerHTML = `
      <div class="caja-state">
        <div class="caja-badge caja-badge-off">Reporte Z · turno #${z.sessionId}</div>
        <div class="caja-block">
          <h3>Ventas</h3>
          ${methodRows(z.totals.byMethod)}
          <div class="caja-line caja-line-total"><span>Total ventas</span><b>${money(z.totals.salesTotal)}</b></div>
        </div>
        <div class="caja-block">
          <h3>Efectivo</h3>
          <div class="caja-line"><span>Fondo inicial</span><b>${money(z.openingFloat)}</b></div>
          <div class="caja-line"><span>Ventas efectivo</span><b>${money(z.totals.byMethod.efectivo || 0)}</b></div>
          <div class="caja-line"><span>Ingresos</span><b>${money(z.totals.cashIn)}</b></div>
          <div class="caja-line"><span>Egresos</span><b>- ${money(z.totals.cashOut)}</b></div>
          <div class="caja-line caja-line-total"><span>Esperado</span><b>${money(z.expectedCash)}</b></div>
          <div class="caja-line"><span>Contado</span><b>${z.countedCash === null ? "—" : money(z.countedCash)}</b></div>
          <div class="caja-line caja-line-total"><span>Diferencia</span><b>${diffTxt}</b></div>
        </div>
        <div class="oa-print-row">
          <button type="button" class="oa-print-btn" data-caja-print-btn>🖨️ Reimprimir cierre</button>
          <small class="oa-print-note" data-caja-print-note></small>
        </div>
        <button type="button" class="auth-submit" data-caja-new-btn>Abrir una nueva caja</button>
      </div>`;
    cajaPanel.querySelector("[data-caja-new-btn]").addEventListener("click", loadCaja);

    // Al cerrar, el Z sale solo. Acá solo se avisa qué pasó y queda el botón
    // para volver a sacarlo: si la impresora estaba apagada o sin papel, el
    // turno ya está cerrado y sin esto no habría forma de recuperar el papel.
    const printNote = cajaPanel.querySelector("[data-caja-print-note]");
    if (printed === true) {
      printNote.textContent = "🖨️ El cierre salió por la impresora del local.";
    } else if (printed === false) {
      printNote.className = "oa-print-note error";
      printNote.textContent = "La impresora no está disponible: el cierre no se imprimió. La caja quedó cerrada igual.";
    }

    const printBtn = cajaPanel.querySelector("[data-caja-print-btn]");
    printBtn.addEventListener("click", async () => {
      const idle = "🖨️ Reimprimir cierre";
      printBtn.disabled = true;
      printBtn.textContent = "Enviando…";
      printNote.className = "oa-print-note";
      printNote.textContent = "";
      try {
        await api("admin/print-job.php", { kind: "report", sessionId: z.sessionId });
        printBtn.textContent = "✅ Enviado";
        printNote.textContent = "Mandado a la impresora del local.";
        setTimeout(() => { printBtn.textContent = idle; printBtn.disabled = false; }, 2500);
      } catch (error) {
        printBtn.textContent = idle;
        printBtn.disabled = false;
        printNote.className = "oa-print-note error";
        printNote.textContent = error.message;
      }
    });
  }

  function initCaja() {
    if (!cajaPanel) return;
    const cajaTabBtn = document.querySelector('[data-tab-btn="caja"]');
    if (cajaTabBtn) cajaTabBtn.addEventListener("click", loadCaja);
    loadCaja();
  }

  checkStaff().then((role) => {
    if (!role) return; // no es staff: quedó el gate
    initOrders();                                     // todo el staff ve pedidos
    if (role === "admin" || role === "cajero") initCaja();
    if (role === "admin") {
      initBirthdays();
      loadProdeTeamsDatalist();
      loadMenuAdmin();
      initRoleMgmt();
    }
  });
})();
