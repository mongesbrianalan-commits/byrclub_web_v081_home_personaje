(() => {
  "use strict";

  /* =========================================================
     BYR DT — pestaña del panel de admin.
     Fecha en juego, sincronizar puntajes, cerrar y premiar,
     abrir la próxima, cargar jugadores y precios, corregir a
     mano y moderar nombres y escudos.
  ========================================================= */

  const box = document.querySelector("[data-dt-admin]");
  if (!box) return;
  const API = "/api/admin/";
  const $ = (s) => box.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function call(path, body) {
    const res = await fetch(API + path, body === undefined
      ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || "Ocurrió un error."), { code: data.code, data });
    return data;
  }
  function msg(el, text, type) {
    el.textContent = text || "";
    el.className = "auth-form-status" + (type ? " is-" + type : "");
  }

  let status = null;
  let loaded = false;

  async function loadStatus() {
    const st = $("[data-dtx-status]");
    try {
      status = await call("dt-status.php");
    } catch (e) {
      st.textContent = e.message;
      return;
    }
    const warn = $("[data-dtx-warn]");
    if (!status.ready) {
      warn.hidden = false;
      warn.textContent = "⚠️ BYR DT todavía no está activado: falta correr la migración 2026-10-dt.sql en phpMyAdmin.";
      st.textContent = "—";
      return;
    }
    warn.hidden = !status.apiError;
    if (status.apiError) warn.textContent = "⚠️ " + status.apiError;

    const r = status.round;
    if (r) {
      const label = { open: "Abierta", live: "En juego", closed: "Cerrada" }[r.status];
      st.innerHTML = `<span class="dtx-badge ${r.status}">${label}</span>${esc(r.name)} · ${status.complete} equipos completos (${status.teams} creados)
        <small>${r.status === "open" ? "Se cierra " + esc(r.deadlineText) + " (cuando arranca el primer partido)." : "Cerró " + esc(r.deadlineText) + ". Sincronizá a medida que terminan los partidos."}</small>`;
    } else {
      st.innerHTML = `No hay ninguna fecha en juego. ${status.teams} equipos creados (${status.complete} completos).<small>Abrí la próxima fecha abajo.</small>`;
    }

    $("[data-dtx-fixtures]").innerHTML = status.fixtures.map((f) => {
      const tag = f.void ? ["void", "Suspendido"] : f.scored ? ["ok", "Puntuado"] : f.done ? ["todo", "Falta puntuar"] : ["wait", f.status === "NS" || f.status === "TBD" ? f.when : "En juego"];
      return `<div class="dtx-fx"><span>${esc(f.label)}</span><span class="${tag[0]}">${esc(tag[1])}</span></div>`;
    }).join("");

    $("[data-dtx-sync]").disabled = !r;
    $("[data-dtx-close]").disabled = !r || r.status !== "live";

    const ob = $("[data-dtx-open-block]");
    ob.hidden = !!r;
    const sel = $("[data-dtx-round-select]");
    sel.innerHTML = status.apiRounds.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
    if (status.apiCurrent) {
      const idx = status.apiRounds.findIndex((x) => x.value === status.apiCurrent);
      if (idx >= 0) sel.selectedIndex = Math.min(idx + (status.rounds.some((x) => x.status === "closed") ? 0 : 0), status.apiRounds.length - 1);
    }

    $("[data-dtx-players-info]").textContent = status.players
      ? `${status.players} jugadores con precio. Última actualización: ${status.lastSync || "—"}.`
      : "Todavía no hay jugadores cargados. Empezá por acá.";

    $("[data-dtx-rounds]").innerHTML = status.rounds.filter((x) => x.status === "closed").map((x) => `
      <div class="dtx-item"><b>${esc(x.name)}</b>
        ${x.winner ? `<small>${esc(x.winner.team)} (DT ${esc(x.winner.dt)}) · ${x.winner.points} pts · cupón ${esc(x.winner.code || "—")}</small>
          ${x.delivered ? `<span class="dtx-badge closed">Premio entregado</span>` : `<button type="button" class="ma-save" data-delivered="${x.id}">Marcar entregado</button>`}`
        : `<small>Sin ganador</small>`}
      </div>`).join("") || `<p class="admin-hint-line">Todavía no se cerró ninguna fecha.</p>`;
    box.querySelectorAll("[data-delivered]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await call("dt-teams.php", { action: "delivered", roundId: +b.dataset.delivered }); loadStatus(); } catch (e) { alertMsg(e.message); b.disabled = false; }
    }));
  }

  function alertMsg(t) { msg($("[data-dtx-sync-msg]"), t, "error"); }

  /* --- Sincronizar puntajes (repite hasta terminar) --- */
  $("[data-dtx-sync]").addEventListener("click", async (e) => {
    const b = e.currentTarget, m = $("[data-dtx-sync-msg]");
    b.disabled = true;
    msg(m, "Sincronizando…");
    try {
      let d, guard = 0;
      do {
        d = await call("dt-sync-scores.php", {});
        msg(m, d.done + (d.remaining ? ` · faltan ${d.remaining} por traer…` : ""));
      } while (d.remaining > 0 && ++guard < 10);
      msg(m, "✅ " + d.done, "ok");
    } catch (ex) {
      msg(m, ex.message, "error");
    }
    b.disabled = false;
    loadStatus();
  });

  /* --- Cerrar la fecha --- */
  $("[data-dtx-close]").addEventListener("click", async (e) => {
    const b = e.currentTarget, m = $("[data-dtx-sync-msg]");
    if (!confirm("¿Cerrar la fecha? Se elige el ganador, se genera su cupón y se mueven los precios. No se puede deshacer.")) return;
    b.disabled = true;
    try {
      let d;
      try {
        d = await call("dt-close.php", {});
      } catch (ex) {
        if (ex.code !== "pending") throw ex;
        if (!confirm(ex.message + "\n\n¿Cerrar igual sin esos partidos?")) { b.disabled = false; return; }
        d = await call("dt-close.php", { force: true });
      }
      msg(m, d.winner
        ? `✅ Fecha cerrada. Ganó ${d.winner.team} (DT ${d.winner.dt}) con ${d.winner.points} pts. Cupón: ${d.winner.code}. ${d.pricesChanged} precios actualizados.`
        : `✅ Fecha cerrada sin ganador. ${d.pricesChanged} precios actualizados.`, "ok");
    } catch (ex) {
      msg(m, ex.message, "error");
    }
    b.disabled = false;
    loadStatus();
  });

  /* --- Abrir la próxima fecha --- */
  $("[data-dtx-open]").addEventListener("click", async (e) => {
    const b = e.currentTarget, m = $("[data-dtx-open-msg]");
    const apiRound = $("[data-dtx-round-select]").value;
    if (!apiRound) return;
    b.disabled = true;
    try {
      const d = await call("dt-round-create.php", { apiRound });
      msg(m, `✅ ${d.name} abierta. Cierra ${d.deadline}.`, "ok");
    } catch (ex) {
      msg(m, ex.message, "error");
    }
    b.disabled = false;
    loadStatus();
  });

  /* --- Jugadores y precios (pasos encadenados) --- */
  $("[data-dtx-players]").addEventListener("click", async (e) => {
    const b = e.currentTarget, log = $("[data-dtx-log]");
    b.disabled = true;
    log.hidden = false;
    log.textContent = "Arrancando…\n";
    let step = { step: "clubs" }, guard = 0;
    try {
      while (step && guard++ < 60) {
        const d = await call("dt-sync-players.php", step);
        log.textContent += d.done + "\n";
        log.scrollTop = log.scrollHeight;
        step = d.next;
      }
      log.textContent += "✅ Listo.\n";
    } catch (ex) {
      log.textContent += "❌ " + ex.message + "\nVolvé a tocar el botón: arranca de nuevo sin romper nada.\n";
    }
    b.disabled = false;
    loadStatus();
  });

  /* --- Corregir a mano --- */
  let pick = null, qTimer = null;
  $("[data-dtx-q]").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    const q = e.target.value.trim();
    qTimer = setTimeout(async () => {
      const out = $("[data-dtx-results]");
      if (q.length < 2) { out.innerHTML = ""; return; }
      try {
        const d = await call("dt-score-edit.php?q=" + encodeURIComponent(q));
        out.innerHTML = d.players.map((p) => `<button type="button" class="dtx-item" data-pid="${p.id}" style="cursor:pointer;color:inherit;font:inherit;text-align:left">${esc(p.label)}</button>`).join("") || `<p class="admin-hint-line">Sin resultados.</p>`;
        out.querySelectorAll("[data-pid]").forEach((x) => x.addEventListener("click", () => openScore(+x.dataset.pid, x.textContent)));
      } catch (ex) {
        out.innerHTML = `<p class="admin-hint-line">${esc(ex.message)}</p>`;
      }
    }, 250);
  });

  async function openScore(id, label) {
    pick = id;
    const ed = $("[data-dtx-edit]");
    try {
      const d = await call("dt-score-edit.php?player=" + id);
      const s = d.score || {};
      $("[data-dtx-edit-title]").textContent = `${label} · ${d.round}${s.manual == 1 ? " · corregido a mano" : ""}${d.score ? ` · hoy suma ${s.points} pts` : " · sin datos en esta fecha"}`;
      ed.querySelectorAll("[data-f]").forEach((inp) => {
        const k = inp.dataset.f;
        if (inp.type === "checkbox") inp.checked = s[k] == 1;
        else inp.value = s[k] == null ? (k === "rating" ? "" : 0) : String(s[k]).replace(".", ",");
      });
      ed.hidden = false;
      msg($("[data-dtx-score-msg]"), "");
    } catch (ex) {
      msg($("[data-dtx-score-msg]"), ex.message, "error");
    }
  }

  $("[data-dtx-save-score]").addEventListener("click", async () => {
    if (!pick) return;
    const body = { player: pick };
    box.querySelectorAll("[data-dtx-edit] [data-f]").forEach((inp) => { body[inp.dataset.f] = inp.type === "checkbox" ? inp.checked : inp.value; });
    try {
      const d = await call("dt-score-edit.php", body);
      msg($("[data-dtx-score-msg]"), `✅ Guardado: ahora suma ${d.points} pts en ${d.round}. Ya se recalcularon los equipos.`, "ok");
    } catch (ex) {
      msg($("[data-dtx-score-msg]"), ex.message, "error");
    }
  });

  /* --- Nombres y escudos --- */
  async function loadTeams(q) {
    const out = $("[data-dtx-teams]");
    try {
      const d = await call("dt-teams.php" + (q ? "?q=" + encodeURIComponent(q) : ""));
      out.innerHTML = d.teams.map((t) => `
        <div class="dtx-item">
          <span class="dtx-crest">${t.crest ? `<img src="${esc(t.crest)}" alt="">` : esc(t.initials)}</span>
          <b>${esc(t.name)}<br><small>DT: ${esc(t.dt)} · ${t.players}/15 · ${esc(t.updated)}</small></b>
          ${t.crest ? `<button type="button" class="cat-btn" data-act="remove_crest" data-id="${t.id}">Quitar escudo</button>` : ""}
          <button type="button" class="cat-btn danger" data-act="reset_name" data-id="${t.id}">Resetear nombre</button>
        </div>`).join("") || `<p class="admin-hint-line">Todavía no hay equipos.</p>`;
      out.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(b.dataset.act === "reset_name" ? "¿Resetear el nombre de este equipo?" : "¿Quitar el escudo de este equipo?")) return;
        b.disabled = true;
        try { await call("dt-teams.php", { action: b.dataset.act, teamId: +b.dataset.id }); loadTeams($("[data-dtx-tq]").value.trim()); }
        catch (ex) { alert(ex.message); b.disabled = false; }
      }));
    } catch (ex) {
      out.innerHTML = `<p class="admin-hint-line">${esc(ex.message)}</p>`;
    }
  }
  let tTimer = null;
  $("[data-dtx-tq]").addEventListener("input", (e) => { clearTimeout(tTimer); tTimer = setTimeout(() => loadTeams(e.target.value.trim()), 250); });

  /* Se carga la primera vez que abren la pestaña (consulta la API). */
  const tabBtn = document.querySelector('[data-tab-btn="dt"]');
  if (tabBtn) tabBtn.addEventListener("click", () => {
    if (!loaded) { loaded = true; loadStatus(); loadTeams(""); }
    else loadStatus();
  });
})();
