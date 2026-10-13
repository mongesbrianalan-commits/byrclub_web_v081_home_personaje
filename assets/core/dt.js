(() => {
  "use strict";

  /* =========================================================
     BYR DT — armá tu equipo con jugadores de la Liga Profesional
     ---------------------------------------------------------
     Toda la pantalla vive acá. El servidor manda el estado
     (fecha, equipo, plantel, puntos) y la lista de jugadores; el
     armado del equipo se hace en el navegador como "borrador" y
     se manda entero al confirmar. El servidor vuelve a validar
     todo (presupuesto, puestos, clubes, cambios): esto es la
     comodidad, la regla está allá.
  ========================================================= */

  const API = "/api/dt/";
  const root = document.getElementById("dt-app");
  if (!root) return;

  const POS_ORDER = ["ARQ", "DEF", "MED", "DEL"];
  const POS_NAME = { ARQ: "Arquero", DEF: "Defensor", MED: "Mediocampista", DEL: "Delantero" };
  const POS_PLURAL = { ARQ: "arqueros", DEF: "defensores", MED: "mediocampistas", DEL: "delanteros" };

  let S = null;              // respuesta de state.php
  let players = null;        // mercado (players.php)
  let byId = new Map();      // id → jugador (mercado + plantel)
  let draft = null;          // { ids:Set, starters:Set, captain, formation }
  let tab = "equipo";
  let market = { pos: "", q: "", sort: "price", limit: 60 };
  let rankScope = "fecha";
  let rankCache = {};
  let saving = false;
  let lastMsg = null;        // { type, text } bajo el botón de confirmar

  /* ---------------- Utilidades ---------------- */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (t) => {
    const m = (t || 0) / 10;
    return "$" + (Number.isInteger(m) ? m.toLocaleString("es-AR") : m.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + " M";
  };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  async function get(path) {
    const res = await fetch(API + path, { credentials: "same-origin" });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no JSON */ }
    if (res.status === 401) { window.location.replace("ingresar.html?next=/dt.html"); throw new Error("Sesión vencida"); }
    if (!res.ok) throw Object.assign(new Error(data.error || "Algo salió mal. Probá de nuevo."), { code: data.code });
    return data;
  }

  async function post(path, body, isForm) {
    const res = await fetch(API + path, {
      method: "POST",
      credentials: "same-origin",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || "Algo salió mal. Probá de nuevo."), { code: data.code });
    return data;
  }

  function shirt(p, cls) {
    return `<svg class="${cls || "dt-shirt"}" viewBox="0 0 48 48" role="img" aria-label="Camiseta de ${esc(p.clubName || p.club)}">
      <path d="M16 6 L8 10 L3 19 L10 23 L12 20 L12 42 L36 42 L36 20 L38 23 L45 19 L40 10 L32 6 Q24 12 16 6 Z" fill="${esc(p.color)}"></path>
      <path d="M20 7 Q24 12 28 7" fill="none" stroke="${esc(p.trim)}" stroke-width="3"></path></svg>`;
  }

  function crest(team, extraCls) {
    const inner = team.crest ? `<img src="${esc(team.crest)}" alt="">` : esc(team.initials || "DT");
    return `<span class="dt-crest ${extraCls || ""}" aria-hidden="true">${inner}</span>`;
  }

  let toastTimer = null;
  function toast(text, isError) {
    const el = document.querySelector("[data-dt-toast]");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ---------------- Hoja inferior ---------------- */

  const sheet = {
    wrap: document.querySelector("[data-dt-sheet]"),
    title: document.querySelector("[data-dt-sheet-title]"),
    body: document.querySelector("[data-dt-sheet-body]"),
    open(title, html) {
      this.title.textContent = title;
      this.body.innerHTML = html;
      this.wrap.hidden = false;
      document.body.style.overflow = "hidden";
      const first = this.body.querySelector("button, input, a");
      if (first) first.focus({ preventScroll: true });
    },
    close() {
      this.wrap.hidden = true;
      this.body.innerHTML = "";
      document.body.style.overflow = "";
    }
  };
  if (sheet.wrap) {
    sheet.wrap.addEventListener("click", (e) => { if (e.target === sheet.wrap || e.target.closest("[data-dt-sheet-close]")) sheet.close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.wrap.hidden) sheet.close(); });
  }

  /* ---------------- Borrador del equipo ---------------- */

  function draftFromState() {
    const ids = new Set(S.squad.map((p) => p.id));
    const starters = new Set(S.squad.filter((p) => p.starter).map((p) => p.id));
    const cap = S.squad.find((p) => p.captain);
    draft = { ids, starters, captain: cap ? cap.id : null, formation: S.team.formation || "4-3-3" };
    S.squad.forEach((p) => { if (!byId.has(p.id)) byId.set(p.id, p); });
  }

  const P = (id) => byId.get(id);
  const draftList = () => [...draft.ids].map(P).filter(Boolean);
  const shape = () => S.rules.formations[draft.formation];

  function countPos(list, pos) { return list.filter((p) => p.pos === pos).length; }

  /* Lo que falta para llegar a los 15: [["ARQ",1],["MED",2]…] */
  function missingByPos() {
    const list = draftList();
    return POS_ORDER.map((pos) => [pos, S.rules.squad[pos] - countPos(list, pos)]).filter(([, n]) => n > 0);
  }
  function missingText(miss) {
    return miss.map(([pos, n]) => `${n} ${n === 1 ? POS_NAME[pos].toLowerCase() : POS_PLURAL[pos]}`).join(", ");
  }
  /* Lo mínimo que cuesta completar el plantel con los más baratos que se
     pueden fichar (respetando el máximo por club de forma aproximada).
     null si todavía no cargó el mercado. */
  function cheapestToComplete() {
    if (!players) return null;
    const miss = missingByPos();
    if (!miss.length) return 0;
    const clubCount = {};
    draftList().forEach((p) => { clubCount[p.clubId] = (clubCount[p.clubId] || 0) + 1; });
    let total = 0;
    for (const [pos, n] of miss) {
      const pool = players.filter((p) => p.pos === pos && !draft.ids.has(p.id)).sort((a, b) => a.price - b.price);
      let got = 0;
      for (const p of pool) {
        if (got >= n) break;
        if ((clubCount[p.clubId] || 0) >= S.rules.maxPerClub) continue;
        clubCount[p.clubId] = (clubCount[p.clubId] || 0) + 1;
        total += p.price; got++;
      }
    }
    return total;
  }

  function bank() {
    const original = new Map(S.squad.map((p) => [p.id, p]));
    let b = S.team.bank;
    original.forEach((p, id) => { if (!draft.ids.has(id)) b += (P(id) || p).price; });
    draft.ids.forEach((id) => { if (!original.has(id)) b -= P(id).price; });
    return b;
  }

  function transfersUsed() {
    if (!S.transfers.limited) return null;
    // Cambios = jugadores que no estaban en el equipo que jugó la última fecha.
    const prev = new Set(S.transfers.prev || []);
    return [...draft.ids].filter((id) => !prev.has(id)).length;
  }

  function isDirty() {
    const saved = S.squad;
    if (saved.length !== draft.ids.size) return true;
    if (draft.formation !== S.team.formation) return true;
    for (const p of saved) {
      if (!draft.ids.has(p.id)) return true;
      if (p.starter !== draft.starters.has(p.id)) return true;
      if (p.captain !== (draft.captain === p.id)) return true;
    }
    return false;
  }

  function whyCantBuy(p) {
    const list = draftList();
    if (draft.ids.has(p.id)) return "own";
    if (countPos(list, p.pos) >= S.rules.squad[p.pos]) return `${p.pos} completo`;
    if (list.filter((x) => x.clubId === p.clubId).length >= S.rules.maxPerClub) return `Ya tenés ${S.rules.maxPerClub} de ${p.club}`;
    if (p.price > bank()) return "No te alcanza";
    const t = transfersUsed();
    if (t !== null && t >= S.rules.transfers && !(S.transfers.prev || []).includes(p.id)) return "Sin cambios";
    return null;
  }

  function buy(p) {
    const why = whyCantBuy(p);
    if (why) { toast(why === "own" ? "Ya está en tu equipo." : why, true); return; }
    draft.ids.add(p.id);
    const startersOfPos = [...draft.starters].map(P).filter((x) => x && x.pos === p.pos).length;
    if (startersOfPos < shape()[p.pos]) draft.starters.add(p.id);
    if (!draft.captain && draft.starters.has(p.id) && p.pos === "DEL") draft.captain = p.id;
    lastMsg = null;
    const miss = missingByPos();
    if (!miss.length) {
      tab = "equipo";
      lastMsg = { type: "ok", text: "¡Tenés los 15! Revisá titulares y capitán, y tocá CONFIRMAR EQUIPO." };
      toast(`${p.name} fichado. ¡Plantel completo!`);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Si se llenó este puesto, el mercado salta solo al próximo que falta.
    if (market.pos === p.pos && countPos(draftList(), p.pos) >= S.rules.squad[p.pos]) market.pos = miss[0][0];
    toast(`${p.name} fichado. Te quedan ${money(bank())}.`);
    render();
  }

  function sell(id) {
    draft.ids.delete(id);
    draft.starters.delete(id);
    if (draft.captain === id) draft.captain = null;
    // Si queda un hueco de titular y hay suplente del puesto, sube solo.
    fillStarters();
    lastMsg = null;
    render();
  }

  function fillStarters() {
    const sh = shape();
    POS_ORDER.forEach((pos) => {
      const st = [...draft.starters].map(P).filter((x) => x && x.pos === pos);
      if (st.length > sh[pos]) {
        st.sort((a, b) => a.price - b.price).slice(0, st.length - sh[pos]).forEach((x) => draft.starters.delete(x.id));
      }
      const bench = draftList().filter((x) => x.pos === pos && !draft.starters.has(x.id)).sort((a, b) => b.price - a.price);
      let need = sh[pos] - [...draft.starters].map(P).filter((x) => x && x.pos === pos).length;
      while (need > 0 && bench.length) { draft.starters.add(bench.shift().id); need--; }
    });
    if (draft.captain && !draft.starters.has(draft.captain)) draft.captain = null;
  }

  function setFormation(f) {
    draft.formation = f;
    fillStarters();
    lastMsg = null;
    render();
  }

  /* ---------------- Carga ---------------- */

  async function load(keepTab) {
    try {
      S = await get("state.php");
    } catch (e) {
      root.innerHTML = `<div class="dt-empty-state">${esc(e.code === "dt-not-ready" ? "BYR DT arranca muy pronto. ¡Volvé en un rato!" : e.message)}</div>`;
      return;
    }
    if (!S.team) { welcomeDone ? renderCreate() : renderWelcome(); return; }
    draftFromState();
    if (!keepTab) tab = (S.round && S.round.status === "live") || (!S.canEdit && S.myPoints) ? "puntos" : "equipo";
    rankCache = {};
    render();
    maybeWinnerPopup();
  }

  async function ensurePlayers() {
    if (players) return;
    const d = await get("players.php");
    players = d.players;
    players.forEach((p) => byId.set(p.id, Object.assign(byId.get(p.id) || {}, p)));
  }

  /* ---------------- Bienvenida: cómo funciona ----------------
     Se muestra al entrar por primera vez (todavía sin equipo),
     antes de fundar el club. También se puede volver a ver
     desde la pestaña Reglas. */

  let welcomeDone = false;

  function renderWelcome(onDone) {
    const R = (S && S.rules) || {};
    const budget = money(R.budget || 1000);
    const maxClub = R.maxPerClub || 3;
    const transfers = R.transfers || 3;
    const prize = R.prize || "Doble Cheese con papas";
    const first = ((S && S.me && S.me.dt) || "").trim().split(/\s+/)[0] || "";
    const r = S && S.round;
    const closeLine = r && r.status === "open"
      ? `Esta fecha (${esc(r.name)}) se cierra <b>${esc(r.deadlineText)}</b>.`
      : "Cada fecha se cierra cuando arranca su primer partido.";
    const hero = `<div class="dt-wel__hero" aria-hidden="true"><img src="assets/personaje-byr-prode.png" alt=""></div>`;

    const slides = [
      `${hero}
       <span class="dt-label">BYR Club presenta</span>
       <h1 class="dt-wel__title">¡Bienvenido al <em>BYR DT</em>${first ? ", " + esc(first) : ""}!</h1>
       <p class="dt-wel__text">Sos el DT de tu propio equipo con jugadores reales de la Liga Profesional. Cada fecha sumás puntos según cómo juegan en la cancha y competís contra todos los socios.</p>`,

      `<div class="dt-wel__num">1</div>
       <h2 class="dt-wel__title">Armá tu plantel</h2>
       <p class="dt-wel__text">Fichá <b>15 jugadores</b> con <b>${budget}</b> de presupuesto. Cada jugador tiene su precio.</p>
       <div class="dt-wel__squad">
         <div><strong>2</strong><span>Arqueros</span></div>
         <div><strong>5</strong><span>Defensores</span></div>
         <div><strong>5</strong><span>Medios</span></div>
         <div><strong>3</strong><span>Delanteros</span></div>
       </div>
       <p class="dt-wel__note">Máximo ${maxClub} jugadores del mismo club.</p>`,

      `<div class="dt-wel__num">2</div>
       <h2 class="dt-wel__title">Elegí titulares y capitán</h2>
       <p class="dt-wel__text">Elegí la formación y tus <b>11 titulares</b>. Los otros 4 quedan en el banco.</p>
       <div class="dt-wel__cards">
         <div><span class="dt-wel__badge">C</span><p>Tu <b>capitán</b> suma <b>el doble</b> de puntos.</p></div>
         <div><span class="dt-wel__badge dt-wel__badge--blue">↺</span><p>Si un titular no juega, <b>entra solo</b> un suplente de su mismo puesto.</p></div>
       </div>`,

      `<div class="dt-wel__num">3</div>
       <h2 class="dt-wel__title">Sumá puntos</h2>
       <p class="dt-wel__text">Tus jugadores suman con lo que hacen en cada partido real:</p>
       <div class="dt-wel__pts">
         <div><span>Gol</span><b>+4 a +6</b></div>
         <div><span>Asistencia</span><b>+3</b></div>
         <div><span>Valla invicta</span><b>+4</b></div>
         <div><span>Jugar 60 minutos</span><b>+2</b></div>
         <div><span>Amarilla / Roja</span><b class="is-neg">−1 / −3</b></div>
       </div>
       <p class="dt-wel__note">La tabla completa está en la pestaña Reglas.</p>`,

      `<div class="dt-wel__num">4</div>
       <h2 class="dt-wel__title">Confirmá a tiempo</h2>
       <p class="dt-wel__text">${closeLine} Después no se puede tocar hasta la fecha siguiente.</p>
       <div class="dt-wel__cards">
         <div><span class="dt-wel__badge">${transfers}</span><p>Desde tu segunda fecha tenés <b>${transfers} cambios</b> por fecha para mejorar el equipo.</p></div>
         <div><span class="dt-wel__badge dt-wel__badge--blue">$</span><p>Los <b>precios suben o bajan</b> después de cada fecha según cómo jugó cada uno.</p></div>
       </div>`,

      `${hero}
       <h2 class="dt-wel__title">Los premios</h2>
       <div class="dt-prizes">
         <div><span class="dt-label">Ganador de cada fecha</span><strong style="color:#ffd51f">${esc(prize)}</strong></div>
         <div class="is-gold"><span class="dt-label">Campeón del torneo</span><strong>$50.000 en consumo</strong></div>
       </div>
       <p class="dt-wel__text" style="margin-top:14px">Primero fundá tu club: ponele nombre y escudo. ¡Vos sos el DT!</p>`
    ];

    let i = 0;
    root.innerHTML = `
      <section class="dt-wel" aria-roledescription="carrusel" aria-label="Cómo funciona BYR DT">
        <div class="dt-wel__top">
          <div class="dt-wel__dots" role="tablist">${slides.map((_, k) => `<button type="button" role="tab" class="dt-wel__dot" data-dot="${k}" aria-label="Paso ${k + 1} de ${slides.length}"></button>`).join("")}</div>
          <button type="button" class="dt-wel__skip" data-skip>Saltar</button>
        </div>
        <div class="dt-wel__slide" data-slide aria-live="polite"></div>
        <div class="dt-actions">
          <button type="button" class="dt-btn dt-btn--ghost" data-prev>Atrás</button>
          <button type="button" class="dt-btn dt-btn--yellow" data-next>SIGUIENTE</button>
        </div>
      </section>`;

    const box = root.querySelector("[data-slide]");
    const prev = root.querySelector("[data-prev]");
    const next = root.querySelector("[data-next]");
    const skip = root.querySelector("[data-skip]");
    const last = slides.length - 1;
    const finish = () => {
      welcomeDone = true;
      window.scrollTo(0, 0);
      if (onDone) onDone(); else renderCreate();
    };

    function show(k) {
      i = Math.max(0, Math.min(last, k));
      box.innerHTML = slides[i];
      box.classList.remove("is-in"); void box.offsetWidth; box.classList.add("is-in");
      if (k !== undefined && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
      root.querySelectorAll("[data-dot]").forEach((d, n) => d.setAttribute("aria-selected", n === i ? "true" : "false"));
      prev.style.visibility = i === 0 ? "hidden" : "visible";
      next.textContent = i === last ? (onDone ? "VOLVER" : "FUNDAR MI CLUB") : "SIGUIENTE";
      skip.style.visibility = i === last ? "hidden" : "visible";
    }

    prev.addEventListener("click", () => show(i - 1));
    next.addEventListener("click", () => (i === last ? finish() : show(i + 1)));
    skip.addEventListener("click", finish);
    root.querySelectorAll("[data-dot]").forEach((d) => d.addEventListener("click", () => show(+d.dataset.dot)));

    // Deslizar con el dedo
    let x0 = null;
    box.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
    });

    show(0);
    window.scrollTo(0, 0);
  }

  /* ---------------- Crear el equipo ---------------- */

  function renderCreate(existing) {
    const dtName = existing ? existing.dt : ((S && S.me && S.me.dt) || "Vos");
    const name = existing ? existing.name : "";
    root.innerHTML = `
      <h1 class="dt-h1">${existing ? "Tu club" : "Fundá tu club"}</h1>
      <p class="dt-muted">${existing ? "Cambiá el nombre o el escudo cuando quieras." : "Ponele nombre y escudo. Vos sos el DT."}</p>
      <div class="dt-create-card">
        <span class="dt-crest" data-preview-crest>${existing && existing.crest ? `<img src="${esc(existing.crest)}" alt="">` : esc(initials(name) || "DT")}</span>
        <div class="dt-create-card__name" data-preview-name>${esc(name || "Tu equipo")}</div>
        <div class="dt-create-card__dt">DT: ${esc(dtName)}</div>
      </div>
      <label class="dt-field">Nombre del equipo
        <input type="text" maxlength="24" placeholder="Ej: Los Cheddar FC" value="${esc(name)}" data-name>
        <small>Hasta 24 letras. Lo ven todos en el ranking.</small>
      </label>
      <div class="dt-field">Escudo
        <label class="dt-upload">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
          <span data-file-label>Subir foto desde el celu</span>
          <input type="file" accept="image/*" data-file>
        </label>
        <small>Se recorta en círculo. Si no subís nada, usamos tus iniciales. Nombres o fotos ofensivas se borran.</small>
      </div>
      <p class="dt-error" data-err hidden></p>
      <div class="dt-actions">
        ${existing ? `<button type="button" class="dt-btn dt-btn--ghost" data-cancel>Volver</button>` : ""}
        <button type="button" class="dt-btn dt-btn--yellow" data-save>${existing ? "GUARDAR" : "CREAR MI EQUIPO"}</button>
      </div>`;

    const nameIn = root.querySelector("[data-name]");
    const fileIn = root.querySelector("[data-file]");
    const prevName = root.querySelector("[data-preview-name]");
    const prevCrest = root.querySelector("[data-preview-crest]");
    let file = null;

    nameIn.addEventListener("input", () => {
      prevName.textContent = nameIn.value.trim() || "Tu equipo";
      if (!file && !(existing && existing.crest)) prevCrest.textContent = initials(nameIn.value) || "DT";
    });
    fileIn.addEventListener("change", () => {
      file = fileIn.files && fileIn.files[0];
      if (!file) return;
      root.querySelector("[data-file-label]").textContent = "Foto elegida ✓ (tocá para cambiarla)";
      const r = new FileReader();
      r.onload = () => { prevCrest.innerHTML = `<img src="${r.result}" alt="">`; };
      r.readAsDataURL(file);
    });
    const cancel = root.querySelector("[data-cancel]");
    if (cancel) cancel.addEventListener("click", () => render());

    root.querySelector("[data-save]").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const err = root.querySelector("[data-err]");
      err.hidden = true;
      btn.disabled = true;
      try {
        await post("team-save.php", { name: nameIn.value });
        if (file) {
          const fd = new FormData();
          fd.append("crest", file);
          await post("crest.php", fd, true);
        }
        await load();
        if (!existing) { tab = "mercado"; render(); toast("¡Equipo creado! Ahora fichá tus 15 jugadores."); }
        else toast("Guardado.");
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
  }

  function initials(name) {
    const w = String(name || "").trim().split(/\s+/).filter((x) => x.length > 2);
    return w.slice(0, 2).map((x) => x[0].toUpperCase()).join("");
  }

  /* ---------------- Pantalla principal ---------------- */

  function render() {
    if (!S || !S.team) return;
    const r = S.round;
    const b = bank();
    const t = transfersUsed();
    const dirty = isDirty();

    let alert = "";
    if (!r) {
      alert = `<div class="dt-alert dt-alert--info">${icon("clock")}<span>Todavía no está abierta la próxima fecha. Mientras tanto podés ir armando tu equipo.</span></div>`;
    } else if (r.status === "open" && (S.needsConfirm || dirty)) {
      alert = `<div class="dt-alert">${icon("clock")}<span>${dirty ? "Tenés cambios sin confirmar." : "Todavía no confirmaste tu equipo."} La ${esc(r.name)} cierra <b>${esc(r.deadlineText)}</b>${r.secondsLeft < 86400 ? ` (en ${esc(left(r.secondsLeft))})` : ""}.</span></div>`;
    } else if (r.status === "open") {
      alert = `<div class="dt-alert dt-alert--info">${icon("check")}<span>Equipo confirmado para la ${esc(r.name)}. Podés cambiarlo hasta ${esc(r.deadlineText)}.</span></div>`;
    } else if (r.status === "live") {
      alert = `<div class="dt-alert dt-alert--info">${icon("ball")}<span>La ${esc(r.name)} está en juego. Vas a poder hacer cambios cuando termine.</span></div>`;
    }

    root.innerHTML = `
      <div class="dt-teamhead">
        <button type="button" class="dt-crest" data-edit-team aria-label="Editar nombre y escudo">${S.team.crest ? `<img src="${esc(S.team.crest)}" alt="">` : esc(S.team.initials)}</button>
        <div style="flex:1;min-width:0">
          <div class="dt-teamhead__name">${esc(S.team.name)}</div>
          <div class="dt-teamhead__dt">DT: ${esc(S.team.dt)}</div>
          <div class="dt-teamhead__round">${r ? esc(r.name) + (r.status === "open" ? " · cierra " + esc(r.deadlineText) : r.status === "live" ? " · en juego" : "") : "BYR DT"}</div>
        </div>
      </div>
      ${S.team.nameReset ? `<div class="dt-alert">${icon("alert")}<span>Tuvimos que cambiar el nombre de tu equipo. Tocá el escudo y elegí otro.</span></div>` : ""}
      ${alert}
      <div class="dt-stats">
        <div class="dt-stat"><span class="dt-label">Presupuesto</span><strong class="${b < 0 ? "is-red" : "is-yellow"}">${money(b)}</strong></div>
        <div class="dt-stat"><span class="dt-label">Cambios</span><strong>${t === null ? "Libres" : `${Math.max(0, S.rules.transfers - t)} / ${S.rules.transfers}`}</strong></div>
        <div class="dt-stat"><span class="dt-label">Total</span><strong>${S.general.points} pts</strong></div>
      </div>
      <div class="dt-tabs" role="tablist">
        ${[["equipo", "Equipo"], ["mercado", "Fichar"], ["puntos", "Puntos"], ["reglas", "Reglas"]].map(([k, l]) =>
          `<button type="button" class="dt-tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join("")}
      </div>
      <section data-view></section>`;

    root.querySelector("[data-edit-team]").addEventListener("click", () => renderCreate(S.team));
    root.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { tab = el.dataset.tab; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }));

    const view = root.querySelector("[data-view]");
    if (tab === "equipo") renderTeam(view);
    else if (tab === "mercado") renderMarket(view);
    else if (tab === "puntos") renderPoints(view);
    else renderRules(view);
  }

  function left(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  function icon(name) {
    const d = {
      clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
      alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
      trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4Z M7 5H4v1a3 3 0 0 0 3 3 M17 5h3v1a3 3 0 0 1-3 3 M12 12v4 M8 20h8 M9.5 16h5v4h-5z"/>'
    }[name] || "";
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  }

  /* ---------------- Equipo (cancha) ---------------- */

  function renderTeam(view) {
    const editable = !!S.canEdit || !S.round;
    const list = draftList();
    const sh = shape();
    const starters = list.filter((p) => draft.starters.has(p.id));
    const bench = list.filter((p) => !draft.starters.has(p.id)).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));

    const rows = ["DEL", "MED", "DEF", "ARQ"].map((pos) => {
      const inPos = starters.filter((p) => p.pos === pos);
      const slots = [];
      for (let i = 0; i < sh[pos]; i++) {
        const p = inPos[i];
        if (p) {
          slots.push(`<button type="button" class="dt-slot" data-player="${p.id}" ${editable ? "" : "disabled"} aria-label="${esc(p.name)}, ${POS_NAME[p.pos]}">
            ${shirt(p)}${draft.captain === p.id ? '<span class="dt-slot__cap" aria-label="Capitán">C</span>' : ""}
            <span class="dt-slot__name">${esc(p.name)}</span><span class="dt-slot__meta">${esc(p.club)} · ${money(p.price)}</span></button>`);
        } else {
          const full = countPos(list, pos) >= S.rules.squad[pos];
          slots.push(`<button type="button" class="dt-slot dt-slot--empty" data-empty="${pos}" ${editable ? "" : "disabled"}>
            <span class="dt-empty"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg></span>
            <span class="dt-slot__name">${full ? "Subí uno" : "Elegir " + pos}</span></button>`);
        }
      }
      return `<div class="dt-row">${slots.join("")}</div>`;
    }).join("");

    const missing = missingByPos();
    // Lugares vacíos del banco: lo que falta y no entra de titular.
    const emptyBench = [];
    POS_ORDER.forEach((pos) => {
      const startersFree = sh[pos] - starters.filter((p) => p.pos === pos).length;
      const n = Math.max(0, S.rules.squad[pos] - countPos(list, pos) - startersFree);
      for (let i = 0; i < n; i++) emptyBench.push(pos);
    });
    const benchSize = 15 - Object.values(sh).reduce((a, b) => a + b, 0);
    const benchCards = bench.map((p) => `<button type="button" class="dt-benchcard" data-player="${p.id}" ${editable ? "" : "disabled"}>
        <small>${p.pos}</small><b>${esc(p.name)}</b><em>${esc(p.club)} · ${money(p.price)}</em></button>`).join("")
      + emptyBench.map((pos) => `<button type="button" class="dt-benchcard dt-benchcard--empty" data-bench-empty="${pos}" ${editable ? "" : "disabled"}>
        <small>${pos}</small><span class="dt-empty"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg></span><b>Fichar suplente</b></button>`).join("");
    const need = cheapestToComplete();
    const shortMoney = need !== null && need > bank();

    view.innerHTML = `
      <div class="dt-pills dt-pills--form" role="group" aria-label="Formación">
        ${Object.keys(S.rules.formations).map((f) => `<button type="button" class="dt-pill" aria-pressed="${draft.formation === f}" data-formation="${f}" ${editable ? "" : "disabled"}>${f}</button>`).join("")}
      </div>
      <div class="dt-pitch">${rows}</div>
      <h2 class="dt-h2" style="margin-top:14px">Suplentes <small class="dt-muted">(${bench.length}/${benchSize})</small></h2>
      ${benchCards ? `<div class="dt-bench">${benchCards}</div>` : `<p class="dt-muted" style="margin:0 4px">Todavía no tenés suplentes.</p>`}
      ${missing.length ? `<p class="dt-muted" style="margin:10px 4px 0">Para llegar a los 15 te faltan: <b style="color:#ffd51f">${missingText(missing)}</b>. Tocá un lugar vacío para ficharlos.</p>` : ""}
      ${shortMoney ? `<div class="dt-alert" style="margin-top:10px">${icon("alert")}<span>Con ${money(bank())} no te alcanza para completar los 15 (necesitás al menos ${money(need)}). Vendé a algún titular caro y fichá uno más barato.</span></div>` : ""}
      ${editable ? `
      <div class="dt-actions">
        <button type="button" class="dt-btn dt-btn--ghost" data-go-market>Fichar</button>
        <button type="button" class="dt-btn dt-btn--yellow" data-confirm ${saving ? "disabled" : ""}>${saving ? "GUARDANDO…" : "CONFIRMAR EQUIPO"}</button>
      </div>` : ""}
      ${lastMsg ? `<p class="${lastMsg.type === "ok" ? "dt-ok" : "dt-error"}">${esc(lastMsg.text)}</p>` : ""}`;

    view.querySelectorAll("[data-formation]").forEach((el) => el.addEventListener("click", () => setFormation(el.dataset.formation)));
    view.querySelectorAll("[data-player]").forEach((el) => el.addEventListener("click", () => playerSheet(+el.dataset.player)));
    view.querySelectorAll("[data-empty]").forEach((el) => el.addEventListener("click", () => {
      const pos = el.dataset.empty;
      if (countPos(draftList(), pos) >= S.rules.squad[pos]) {
        toast(`Ya tenés tus ${S.rules.squad[pos]} ${POS_PLURAL[pos]}: tocá uno del banco para ponerlo de titular.`);
        return;
      }
      market.pos = pos; tab = "mercado"; render();
    }));
    view.querySelectorAll("[data-bench-empty]").forEach((el) => el.addEventListener("click", () => {
      market.pos = el.dataset.benchEmpty; market.sort = "cheap"; market.limit = 60; tab = "mercado"; render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    const gm = view.querySelector("[data-go-market]");
    if (gm) gm.addEventListener("click", () => { tab = "mercado"; render(); });
    const cf = view.querySelector("[data-confirm]");
    if (cf) cf.addEventListener("click", confirmTeam);
  }

  function playerSheet(id) {
    const p = P(id);
    if (!p) return;
    const isStarter = draft.starters.has(id);
    const swaps = draftList().filter((x) => x.pos === p.pos && x.id !== id && draft.starters.has(x.id) !== isStarter);
    sheet.open(p.name, `
      <div class="dt-prow" style="margin-bottom:12px">${shirt(p)}
        <div class="dt-prow__info"><b>${esc(p.name)}</b><small>${esc(p.clubName || p.club)} · ${POS_NAME[p.pos]}</small></div>
        <div class="dt-prow__num"><small>${p.avg != null ? String(p.avg).replace(".", ",") + " pts/fecha" : "—"}</small><strong>${money(p.price)}</strong></div>
      </div>
      <div class="dt-sheet__menu">
        ${isStarter ? (draft.captain === id
          ? `<p class="dt-ok" style="margin:0 0 4px">Es tu capitán: sus puntos valen doble.</p>`
          : `<button type="button" class="dt-btn dt-btn--yellow" data-act="captain">HACERLO CAPITÁN</button>`) : ""}
        ${swaps.map((x) => `<button type="button" class="dt-btn dt-btn--ghost" data-act="swap" data-with="${x.id}">${isStarter ? "Mandar al banco y que entre" : "Poner de titular por"} ${esc(x.name)}</button>`).join("")}
        <button type="button" class="dt-btn dt-btn--danger" data-act="sell">Vender (+${money(p.price)})</button>
      </div>`);
    sheet.body.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", () => {
      const act = el.dataset.act;
      if (act === "captain") draft.captain = id;
      if (act === "swap") {
        const other = +el.dataset.with;
        if (isStarter) { draft.starters.delete(id); draft.starters.add(other); if (draft.captain === id) draft.captain = null; }
        else { draft.starters.delete(other); draft.starters.add(id); if (draft.captain === other) draft.captain = null; }
      }
      if (act === "sell") { sheet.close(); sell(id); return; }
      lastMsg = null;
      sheet.close();
      render();
    }));
  }

  async function confirmTeam() {
    const list = draftList();
    if (list.length !== 15) { lastMsg = { type: "err", text: `Te faltan ${15 - list.length} jugadores para completar los 15.` }; render(); return; }
    if (!draft.captain) { lastMsg = { type: "err", text: "Elegí un capitán: tocá un titular y \"Hacerlo capitán\"." }; render(); return; }
    saving = true; render();
    try {
      await post("squad-save.php", { players: [...draft.ids], starters: [...draft.starters], captain: draft.captain, formation: draft.formation });
      saving = false;
      await load(true);
      lastMsg = { type: "ok", text: "¡Equipo confirmado! Podés cambiarlo hasta que arranque la fecha." };
      render();
    } catch (e) {
      saving = false;
      lastMsg = { type: "err", text: e.message };
      render();
    }
  }

  /* ---------------- Mercado ---------------- */

  async function renderMarket(view) {
    if (!players) {
      view.innerHTML = `<p class="dt-loading">Cargando jugadores…</p>`;
      try { await ensurePlayers(); } catch (e) { view.innerHTML = `<div class="dt-empty-state">${esc(e.message)}</div>`; return; }
      if (tab !== "mercado") return;
    }
    const editable = !!S.canEdit || !S.round;
    const b = bank();
    const spent = Math.max(0, S.rules.budget - b);
    const miss = missingByPos();
    if (editable && market.pos && miss.length && countPos(draftList(), market.pos) >= S.rules.squad[market.pos]) market.pos = miss[0][0];
    const need = cheapestToComplete();
    const hint = !editable ? "" : !miss.length
      ? `<div class="dt-alert dt-alert--info">${icon("check")}<span>¡Ya tenés los 15! Volvé a Equipo y confirmalo.</span><button type="button" class="dt-btn dt-btn--yellow" data-go-team style="min-height:40px;padding:0 12px;font-size:.95rem;margin-left:auto">EQUIPO</button></div>`
      : `<div class="dt-alert dt-alert--info">${icon("ball")}<span>Te faltan <b style="color:#ffd51f">${missingText(miss)}</b> (titulares o suplentes, cuentan igual).</span></div>`
        + (need !== null && need > b ? `<div class="dt-alert">${icon("alert")}<span>No te alcanza para completar: necesitás al menos ${money(need)}. Vendé a alguien caro.</span></div>` : "");

    view.innerHTML = `
      <div class="dt-budgetbar">
        <div class="dt-budgetbar__top"><span class="dt-label">Te quedan</span><strong>${money(b)}</strong></div>
        <div class="dt-budgetbar__track"><div class="dt-budgetbar__fill" style="width:${Math.min(100, Math.round(100 * spent / S.rules.budget))}%"></div></div>
      </div>
      ${hint}
      <label class="dt-search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
        <input type="search" placeholder="Buscar jugador o club" value="${esc(market.q)}" data-q aria-label="Buscar jugador o club">
      </label>
      <div class="dt-pills dt-pills--grid" role="group" aria-label="Puesto">
        ${[["", "Todos"], ...POS_ORDER.map((p) => [p, p])].map(([k, l]) => `<button type="button" class="dt-pill" aria-pressed="${market.pos === k}" data-pos="${k}">${l} ${k ? `<small>(${countPos(draftList(), k)}/${S.rules.squad[k]})</small>` : ""}</button>`).join("")}
      </div>
      <div class="dt-sort">
        <span class="dt-muted" data-count></span>
        <select data-sort aria-label="Ordenar">
          <option value="price" ${market.sort === "price" ? "selected" : ""}>Más caros</option>
          <option value="cheap" ${market.sort === "cheap" ? "selected" : ""}>Más baratos</option>
          <option value="avg" ${market.sort === "avg" ? "selected" : ""}>Más puntos</option>
          <option value="owners" ${market.sort === "owners" ? "selected" : ""}>Más elegidos</option>
        </select>
      </div>
      <div class="dt-list" data-list></div>
      <p class="dt-muted" style="text-align:center;margin-top:14px">Máximo ${S.rules.maxPerClub} jugadores del mismo club. Los precios se mueven después de cada fecha.</p>`;

    const q = view.querySelector("[data-q]");
    let qTimer = null;
    q.addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(() => { market.q = q.value; market.limit = 60; drawList(view, editable); }, 150); });
    view.querySelectorAll("[data-pos]").forEach((el) => el.addEventListener("click", () => { market.pos = el.dataset.pos; market.limit = 60; renderMarket(view); }));
    view.querySelector("[data-sort]").addEventListener("change", (e) => { market.sort = e.target.value; drawList(view, editable); });
    const gt = view.querySelector("[data-go-team]");
    if (gt) gt.addEventListener("click", () => { tab = "equipo"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    drawList(view, editable);
  }

  function drawList(view, editable) {
    const q = norm(market.q);
    let list = players.filter((p) => (!market.pos || p.pos === market.pos) && (!q || norm(p.name + " " + p.clubName + " " + p.club).includes(q)));
    const sorters = {
      price: (a, b) => b.price - a.price,
      cheap: (a, b) => a.price - b.price,
      avg: (a, b) => (b.avg ?? -99) - (a.avg ?? -99) || b.price - a.price,
      owners: (a, b) => b.owners - a.owners || b.price - a.price
    };
    list.sort(sorters[market.sort] || sorters.price);
    view.querySelector("[data-count]").textContent = `${list.length} jugadores`;
    const shown = list.slice(0, market.limit);

    const el = view.querySelector("[data-list]");
    el.innerHTML = shown.map((p) => {
      const own = draft.ids.has(p.id);
      const why = own ? null : whyCantBuy(p);
      let act = "";
      if (editable && own) act = `<button type="button" class="dt-prow__act dt-prow__act--sell" data-sell="${p.id}" aria-label="Vender a ${esc(p.name)}"><svg viewBox="0 0 20 20"><path d="M4 10h12"/></svg></button>`;
      else if (editable && !why) act = `<button type="button" class="dt-prow__act dt-prow__act--buy" data-buy="${p.id}" aria-label="Fichar a ${esc(p.name)}"><svg viewBox="0 0 20 20"><path d="M10 3v14M3 10h14"/></svg></button>`;
      else if (editable) act = `<span class="dt-prow__why">${esc(why)}</span>`;
      return `<div class="dt-prow">${shirt(p)}
        <div class="dt-prow__info"><b>${esc(p.name)}</b><small>${esc(p.clubName || p.club)} · ${p.pos}${p.owners ? ` · ${p.owners}% lo tiene` : ""}</small></div>
        <div class="dt-prow__num"><small>${p.avg != null ? String(p.avg).replace(".", ",") + " pts" : (p.rating ? "nota " + String(p.rating).replace(".", ",") : "—")}</small><strong>${money(p.price)}</strong></div>
        ${act}</div>`;
    }).join("") + (list.length > shown.length ? `<button type="button" class="dt-btn dt-btn--ghost dt-more" data-more>Ver más (${list.length - shown.length})</button>` : "")
      + (!list.length ? `<div class="dt-empty-state">No encontramos jugadores con esa búsqueda.</div>` : "");

    el.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(P(+b.dataset.buy))));
    el.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", () => { sell(+b.dataset.sell); }));
    const more = el.querySelector("[data-more]");
    if (more) more.addEventListener("click", () => { market.limit += 60; drawList(view, editable); });
  }

  /* ---------------- Puntos y ranking ---------------- */

  async function renderPoints(view) {
    const mp = S.myPoints;
    let html = "";
    if (mp) {
      html += `
        <div class="dt-scorecard">
          <div><div class="dt-label">Tus puntos · ${esc(mp.round.name)}${mp.round.status === "live" ? " (en juego)" : ""}</div>
            <div class="dt-scorecard__pts">${mp.points} <span style="font-size:1.2rem">pts</span></div></div>
          <div><div class="dt-label" style="text-align:right">Puesto</div><div class="dt-scorecard__pos">${mp.pos ? "#" + mp.pos : "—"}</div>
            <div style="font-weight:800;font-size:.8rem;text-align:right">de ${mp.of}</div></div>
        </div>
        <h2 class="dt-h2">Cómo sumó tu equipo</h2>
        <div class="dt-list">${mp.detail.length ? mp.detail.map((d) => `
          <div class="dt-rowcard"><span class="dt-rowcard__pos" style="font-family:inherit;font-weight:800;font-size:.75rem">${d.pos}</span>
            <div class="dt-rowcard__main"><b>${esc(d.name)}${d.captain ? '<span class="dt-captag">C ×2</span>' : ""}${d.sub ? '<span class="dt-subtag">entró del banco</span>' : ""}</b><small>${esc(d.detail || "sin datos todavía")}</small></div>
            <span class="dt-rowcard__pts ${d.points < 0 ? "is-neg" : "is-plus"}">${d.points > 0 ? "+" : ""}${d.points}</span></div>`).join("")
          : `<div class="dt-empty-state">Todavía no hay puntajes de esta fecha. Se cargan cuando terminan los partidos.</div>`}</div>`;
    } else {
      html += `<div class="dt-empty-state">Tus puntos aparecen cuando arranque la primera fecha que juegues.</div>`;
    }
    if (S.winner) {
      html += `<button type="button" class="dt-btn dt-btn--yellow dt-btn--block" style="margin-top:16px" data-winner>VER EL EQUIPO GANADOR · ${esc(S.winner.round.toUpperCase())}</button>`;
    }
    html += `
      <h2 class="dt-h2">Ranking</h2>
      <div class="dt-pills" role="group" aria-label="Ranking">
        <button type="button" class="dt-pill" aria-pressed="${rankScope === "fecha"}" data-scope="fecha">De la fecha</button>
        <button type="button" class="dt-pill" aria-pressed="${rankScope === "general"}" data-scope="general">General</button>
      </div>
      <div class="dt-list" data-rank><p class="dt-loading" style="padding:20px 0">Cargando…</p></div>
      <div class="dt-banner">${icon("trophy")}<span>${rankScope === "general"
        ? "El campeón del torneo (fechas + playoffs) se lleva <b>$50.000 en consumo</b> en BYR."
        : `El que más puntos hace en la fecha se lleva una <b>${esc(S.rules.prize)}</b>.`}</span></div>`;
    view.innerHTML = html;

    view.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { rankScope = b.dataset.scope; renderPoints(view); }));
    const wb = view.querySelector("[data-winner]");
    if (wb) wb.addEventListener("click", () => teamSheet(S.winner.teamId, S.winner.roundId));

    const box = view.querySelector("[data-rank]");
    try {
      if (!rankCache[rankScope]) rankCache[rankScope] = await get("ranking.php?scope=" + rankScope);
      const d = rankCache[rankScope];
      if (tab !== "puntos") return;
      let rows = (d.rows || []).slice();
      if (d.me && !rows.some((r) => r.me)) rows.push(d.me);
      box.innerHTML = rows.length ? rows.map((r) => `
        <button type="button" class="dt-rowcard ${r.me ? "is-me" : ""}" data-team="${r.teamId}" ${rankScope === "fecha" && d.round ? `data-round="${d.round.id}"` : ""}>
          <span class="dt-rowcard__pos">${r.pos}</span>${crest(r)}
          <span class="dt-rowcard__main"><b>${esc(r.team)}</b><small>DT: ${esc(r.me ? "Vos" : r.dt)}</small></span>
          <span class="dt-rowcard__pts">${r.points}</span></button>`).join("")
        : `<div class="dt-empty-state">El ranking se arma cuando arranca la primera fecha.</div>`;
      box.querySelectorAll("[data-round]").forEach((b) => b.addEventListener("click", () => teamSheet(+b.dataset.team, +b.dataset.round)));
    } catch (e) {
      box.innerHTML = `<div class="dt-empty-state">${esc(e.message)}</div>`;
    }
  }

  async function teamSheet(teamId, roundId) {
    sheet.open("Cargando…", `<p class="dt-loading">Cargando equipo…</p>`);
    let d;
    try { d = await get(`team-round.php?team=${teamId}&round=${roundId}`); } catch (e) { sheet.open("Ups", `<p class="dt-error">${esc(e.message)}</p>`); return; }
    const st = d.players.filter((p) => p.starter);
    const sh = { DEL: [], MED: [], DEF: [], ARQ: [] };
    st.forEach((p) => sh[p.pos].push(p));
    const rows = ["DEL", "MED", "DEF", "ARQ"].map((pos) => `<div class="dt-row">${sh[pos].map((p) => `
      <div class="dt-slot ${p.played ? "" : "is-out"}">${shirt(p)}${p.captain ? '<span class="dt-slot__cap">C</span>' : ""}
        <span class="dt-slot__pts ${p.points < 0 ? "is-neg" : ""}">${p.points}</span>
        <span class="dt-slot__name">${esc(p.name)}</span><span class="dt-slot__meta">${esc(p.club)}</span></div>`).join("")}</div>`).join("");
    const subs = d.players.filter((p) => !p.starter && p.played);
    sheet.open(d.isWinner ? "Campeón · " + d.round.name : d.round.name, `
      <div class="dt-teamhead">${crest(d.team)}
        <div style="flex:1;min-width:0"><div class="dt-teamhead__name">${esc(d.team.name)}</div><div class="dt-teamhead__dt">DT: ${esc(d.team.dt)}</div>
        <div class="dt-teamhead__round">Formación ${esc(d.formation)}</div></div>
        <div style="font-family:'Lilita One';font-size:2rem;line-height:1;color:#ffd51f">${d.points}<small style="font-size:.9rem"> pts</small></div></div>
      <div class="dt-pitch" style="min-height:420px">${rows}</div>
      ${subs.length ? `<p class="dt-muted" style="margin:10px 2px 0">Entraron del banco: ${subs.map((p) => esc(p.name) + " (" + p.points + ")").join(", ")}.</p>` : ""}
      ${d.isWinner ? `<p class="dt-ok">Se llevó una ${esc(S.rules.prize)}.</p>` : ""}`);
  }

  /* ---------------- Reglas ---------------- */

  function renderRules(view) {
    const rows = [
      ["Jugó 60 minutos o más", "+2"], ["Gol de delantero", "+4"], ["Gol de mediocampista", "+5"], ["Gol de defensor o arquero", "+6"],
      ["Asistencia", "+3"], ["Valla invicta (arquero / defensor)", "+4"], ["Penal atajado", "+5"], ["Nota del partido 8 o más", "+3"],
      ["Amarilla", "−1"], ["Roja", "−3"], ["Gol en contra o penal errado", "−2"]
    ];
    view.innerHTML = `
      <button type="button" class="dt-btn dt-btn--ghost dt-btn--block" data-replay style="margin:0 0 12px">Ver la bienvenida de nuevo</button>
      <ol class="dt-steps">
        <li><span>1</span>Elegí 15 jugadores (2 arqueros, 5 defensores, 5 mediocampistas y 3 delanteros) con <b>${money(S.rules.budget)}</b>. Máximo ${S.rules.maxPerClub} por club.</li>
        <li><span>2</span>Elegí la formación, tus 11 titulares y un <b>capitán</b>: sus puntos valen doble.</li>
        <li><span>3</span>El equipo se cierra cuando arranca el primer partido de la fecha. Desde tu segunda fecha tenés <b>${S.rules.transfers} cambios</b> por fecha.</li>
        <li><span>4</span>Si un titular no juega, entra un suplente de su mismo puesto que haya jugado.</li>
      </ol>
      <h2 class="dt-h2">Cómo se suman puntos</h2>
      <div class="dt-table">${rows.map(([l, p]) => `<div><span>${l}</span><b class="${p.startsWith("−") ? "is-neg" : ""}">${p}</b></div>`).join("")}</div>
      <p class="dt-muted" style="margin:10px 4px 0">Los datos salen de cada partido real. El capitán multiplica todo por 2.</p>
      <h2 class="dt-h2">Premios</h2>
      <div class="dt-prizes">
        <div><span class="dt-label">Ganador de cada fecha</span><strong style="color:#ffd51f">${esc(S.rules.prize)}</strong></div>
        <div class="is-gold"><span class="dt-label">Campeón del torneo</span><strong>$50.000 en consumo</strong></div>
      </div>
      <ul class="dt-muted" style="margin:12px 4px 0;padding-left:18px;line-height:1.45">
        <li>Empate: gana quien sumó más con su capitán; si siguen iguales, quien confirmó el equipo antes.</li>
        <li>Partidos suspendidos o postergados no cuentan: la fecha se cierra sin ellos.</li>
        <li>El torneo incluye las fechas que quedan del Clausura y los playoffs. Los jugadores de equipos eliminados suman 0.</li>
        <li>Los precios suben o bajan después de cada fecha según cómo jugó cada uno y cuántos lo ficharon (hasta $0,5 M por fecha).</li>
      </ul>`;
    view.querySelector("[data-replay]").addEventListener("click", () => {
      window.scrollTo(0, 0);
      renderWelcome(() => { tab = "reglas"; render(); });
    });
  }

  /* ---------------- Aviso del ganador ---------------- */

  function maybeWinnerPopup() {
    const w = S.winner;
    if (!w) return;
    const key = "byr_dt_winner_seen_" + w.roundId;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (e) { return; }
    sheet.open(w.isMe ? "¡Ganaste la fecha!" : "¡Tenemos campeón!", `
      <div class="dt-winpop">
        <span class="dt-label">BYR DT · ${esc(w.round)}</span>
        ${crest(w)}
        <div class="dt-winpop__team">${esc(w.team)}</div>
        <div style="font-weight:800">DT: ${esc(w.isMe ? "Vos" : w.dt)} · ${w.points} pts</div>
        ${w.isMe && w.code
          ? `<p style="margin:4px 0 0;font-weight:700">Tu premio: una ${esc(S.rules.prize)}. Mostrá este código en el local:</p><div class="dt-code">${esc(w.code)}</div><p class="dt-muted" style="margin:0">También lo tenés en "Mis cupones".</p>`
          : `<p style="margin:4px 0 0;font-weight:700">Se llevó una ${esc(S.rules.prize)}. Mirá cómo armó su equipo.</p>`}
        <button type="button" class="dt-btn dt-btn--yellow dt-btn--block" data-see>${w.isMe ? "VER MI EQUIPO CAMPEÓN" : "VER SU EQUIPO"}</button>
      </div>`);
    const b = sheet.body.querySelector("[data-see]");
    if (b) b.addEventListener("click", () => teamSheet(w.teamId, w.roundId));
  }

  load();
})();
