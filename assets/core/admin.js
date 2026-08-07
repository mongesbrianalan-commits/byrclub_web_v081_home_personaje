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

  let currentEmail = null;
  let currentUser = null;

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
    setStatus(findStatus, "", "");
    pointsInput.focus();
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
      saveTeams.textContent = "Guardar equipos";
      saveTeams.style.cssText = "padding:7px 12px";
      teamRow.append(homeIn, vs, awayIn, saveTeams);

      const meta = document.createElement("small");
      meta.style.cssText = "display:block;margin-top:5px;color:#9fb4dc";
      meta.textContent = `#${m.id} · ${m.kickoffLabel || ""} · ${m.status === "finished" ? "Jugado" : "Pendiente"}`;

      const editSt = document.createElement("small");
      editSt.style.cssText = "display:block;margin-top:2px;font-weight:700";

      info.append(teamRow, meta, editSt);

      saveTeams.addEventListener("click", async () => {
        const home = String(homeIn.value || "").trim();
        const away = String(awayIn.value || "").trim();
        if (!home || !away) {
          editSt.textContent = "Completá ambos equipos.";
          editSt.style.color = "#ffd35a";
          return;
        }
        saveTeams.disabled = true;
        saveTeams.textContent = "Guardando…";
        try {
          const r = await api("admin/prode-edit-match.php", { matchId: m.id, home, away });
          editSt.textContent = `✅ Guardado · escudos: local ${r.homeLogo ? "✓" : "✗"} · visitante ${r.awayLogo ? "✓" : "✗"}`;
          editSt.style.color = "#7bffa0";
        } catch (error) {
          editSt.textContent = error.message;
          editSt.style.color = "#ff8f9a";
        } finally {
          saveTeams.disabled = false;
          saveTeams.textContent = "Guardar equipos";
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

      row.append(info, hg, sep, ag, btn, st);
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

  if (pmAddBtn) pmAddBtn.addEventListener("click", prodeAddMatch);
  if (pmatchLoadBtn) pmatchLoadBtn.addEventListener("click", prodeLoadMatches);

  checkAdmin().then(() => {
    if (panel && !panel.hidden) {
      initBirthdays();
      loadProdeTeamsDatalist();
    }
  });
})();
