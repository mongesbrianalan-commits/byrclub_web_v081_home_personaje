(() => {
  "use strict";

  /* =========================================================
     BYR Club — Prode (frontend real)
     ---------------------------------------------------------
     Trae la fecha actual y el ranking desde el backend, arma
     las tarjetas de partidos, permite cargar/editar el
     pronóstico (con bloqueo al horario) y muestra ranking e
     historial reales. Si no hay fecha activa, muestra un estado
     vacío amable.
  ========================================================= */

  const ROUND_URL = "/api/prode/round.php";
  const RANKING_URL = "/api/prode/ranking.php";
  const RANKING_FECHA_URL = "/api/prode/ranking-fecha.php";
  const PREDICT_URL = "/api/prode/predict.php";
  const WINNER_URL = "/api/prode/winner.php";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    banner: $("[data-prode-banner]"),
    roundName: $("[data-prode-round-name]"),
    matches: $("[data-prode-matches]"),
    empty: $("[data-prode-empty]"),
    ranking: $("[data-prode-ranking]"),
    rankingEmpty: $("[data-prode-ranking-empty]"),
    rankingEmptyText: $("[data-prode-ranking-empty-text]"),
    rankingNote: $("[data-prode-ranking-note]"),
    rankTabs: Array.from(document.querySelectorAll("[data-rank-tab]")),
    historySection: $("[data-prode-history-section]"),
    history: $("[data-prode-history]"),
    pos: $("[data-prode-position]"),
    points: $("[data-prode-points]"),
    hits: $("[data-prode-hits]"),
    winner: $("[data-prode-winner]"),
    winnerRound: $("[data-prode-winner-round]"),
    winnerName: $("[data-prode-winner-name]"),
    winnerAvatar: $("[data-prode-winner-avatar]"),
    winnerSub: $("[data-prode-winner-sub]"),
    knockoutNote: $("[data-prode-knockout-note]"),
    howQual: $("[data-prode-how-qual]")
  };

  if (!els.matches) return; // no estamos en la página del prode

  let currentMatches = [];

  /* Fecha de cruces: además del resultado se elige quién pasa (+5).
     El resultado que vale es el de 90' + alargue; los penales solo definen
     quién pasa. Por eso si el socio pone un ganador, pasa ese. */
  let knockout = false;
  let qualPoints = 5;

  function sideFromScore(h, a) {
    if (h === "" || a === "" || h === null || a === null) return null;
    const nh = Number(h);
    const na = Number(a);
    if (nh === na) return null;
    return nh > na ? "home" : "away";
  }

  function teamOf(m, side) {
    return side === "home" ? m.home : side === "away" ? m.away : "";
  }

  /* Selector "¿Quién pasa?" de un partido abierto. Sigue al marcador: con un
     ganador queda marcado ese; con empate (o sin marcador) se elige a mano. */
  function qualPicker(m, homeInput, awayInput) {
    const wrap = document.createElement("div");
    wrap.className = "qual-pick";
    const title = document.createElement("span");
    title.textContent = "¿Quién pasa de fase?";
    const opts = document.createElement("div");
    opts.className = "qual-options";
    const hint = document.createElement("small");
    hint.className = "qual-hint";

    const state = { pick: m.prediction ? m.prediction.qualifier || null : null };
    const btns = {};
    ["home", "away"].forEach((side) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qual-btn";
      b.textContent = teamOf(m, side);
      b.addEventListener("click", () => {
        state.pick = side;
        sync();
      });
      btns[side] = b;
      opts.append(b);
    });

    function sync() {
      const implied = sideFromScore(homeInput.value, awayInput.value);
      if (implied) state.pick = implied;
      ["home", "away"].forEach((side) => {
        btns[side].classList.toggle("on", state.pick === side);
        btns[side].disabled = !!implied && side !== implied;
        btns[side].setAttribute("aria-pressed", state.pick === side ? "true" : "false");
      });
      if (implied) {
        hint.textContent = `Pusiste que gana ${teamOf(m, implied)}, así que pasa ${teamOf(m, implied)}.`;
      } else if (homeInput.value !== "" && awayInput.value !== "") {
        hint.textContent = "Pusiste empate: elegí quién pasa por penales.";
      } else {
        hint.textContent = `Acertar quién pasa suma +${qualPoints} pts.`;
      }
    }

    homeInput.addEventListener("input", sync);
    awayInput.addEventListener("input", sync);
    sync();

    wrap.append(title, opts, hint);
    return { el: wrap, get: () => state.pick };
  }

  /* Ranking: cacheamos los dos scopes y mostramos el que esté activo.
     "fecha" = solo la fecha en juego; "general" = acumulado del torneo. */
  const rankingData = { fecha: null, general: null };
  let activeScope = "fecha";

  /* ---------------- Helpers de DOM ---------------- */

  function teamEl(name, logo) {
    const team = document.createElement("div");
    team.className = "team";
    const badge = document.createElement("span");
    badge.className = "team-badge";
    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = "";
      img.loading = "lazy";
      badge.appendChild(img);
    } else {
      badge.textContent = "⚽";
    }
    const b = document.createElement("b");
    b.textContent = name;
    team.append(badge, b);
    return team;
  }

  function pill(value) {
    const s = document.createElement("span");
    s.className = "score-pill";
    s.textContent = value;
    return s;
  }

  /* ---------------- Tarjeta de partido ---------------- */

  function matchCard(m) {
    const art = document.createElement("article");
    art.className = "match-card";

    const finished = m.status === "finished";
    const locked = m.locked;

    let statusText = "Abierto";
    let statusClass = "open";
    if (finished) {
      statusText = "Jugado";
      statusClass = "played";
    } else if (locked) {
      statusText = "Cerrado";
      statusClass = "locked";
    }

    const meta = document.createElement("div");
    meta.className = "match-meta";
    const when = document.createElement("span");
    when.textContent = m.kickoffLabel || "";
    const st = document.createElement("span");
    st.className = "match-status " + statusClass;
    st.textContent = statusText;
    meta.append(when, st);
    art.append(meta);

    const teams = document.createElement("div");
    teams.className = "match-teams";
    teams.append(teamEl(m.home, m.homeLogo));

    let homeInput = null;
    let awayInput = null;

    if (finished) {
      const box = document.createElement("div");
      box.className = "match-score-inputs readonly";
      box.append(pill(m.homeGoals), sep(), pill(m.awayGoals));
      teams.append(box);
    } else if (!locked) {
      const box = document.createElement("div");
      box.className = "match-score-inputs";
      homeInput = scoreInput(m.home, m.prediction ? m.prediction.home : "");
      awayInput = scoreInput(m.away, m.prediction ? m.prediction.away : "");
      box.append(homeInput, sep(), awayInput);
      teams.append(box);
    } else {
      const box = document.createElement("div");
      box.className = "match-score-inputs readonly";
      const h = m.prediction ? m.prediction.home : "–";
      const a = m.prediction ? m.prediction.away : "–";
      box.append(pill(h), sep(), pill(a));
      teams.append(box);
    }

    teams.append(teamEl(m.away, m.awayLogo));
    art.append(teams);

    if (finished) {
      art.append(resultEl(m));
    } else if (!locked) {
      const picker = knockout ? qualPicker(m, homeInput, awayInput) : null;
      if (picker) art.append(picker.el);
      art.append(actionEl(m, homeInput, awayInput, picker));
    } else {
      const note = document.createElement("div");
      note.className = "match-result";
      const line = document.createElement("span");
      line.textContent = m.prediction
        ? `Tu pronóstico: ${m.prediction.home} — ${m.prediction.away}`
        : "No cargaste pronóstico para este partido.";
      note.append(line);
      if (knockout && m.prediction && m.prediction.qualifier) {
        const q = document.createElement("span");
        q.textContent = `Elegiste que pasa ${teamOf(m, m.prediction.qualifier)}`;
        note.append(q);
      }
      const strong = document.createElement("strong");
      strong.textContent = "⏳ Partido en juego";
      note.append(strong);
      art.append(note);
    }

    return art;
  }

  function sep() {
    const s = document.createElement("span");
    s.textContent = "—";
    return s;
  }

  function scoreInput(teamName, value) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "30";
    input.placeholder = "0";
    input.setAttribute("aria-label", "Goles de " + teamName);
    if (value !== "" && value !== null && value !== undefined) {
      input.value = value;
    }
    return input;
  }

  function resultEl(m) {
    const wrap = document.createElement("div");
    wrap.className = "match-result";

    const real = document.createElement("span");
    real.textContent = `Resultado real: ${m.homeGoals} — ${m.awayGoals}`;
    wrap.append(real);

    const pts = m.prediction ? m.prediction.points : null;
    const strong = document.createElement("strong");
    if (!m.prediction) {
      strong.textContent = "No pronosticaste · 0 pts";
      strong.className = "result-miss";
    } else if (pts === 10) {
      strong.textContent = `🎯 Resultado exacto · +10 pts`;
      strong.className = "result-hit";
    } else if (pts === 5) {
      strong.textContent = `✅ Acertaste el ganador · +5 pts`;
      strong.className = "result-hit";
    } else {
      strong.textContent = `❌ No acertaste · 0 pts`;
      strong.className = "result-miss";
    }
    if (m.prediction) {
      const mine = document.createElement("span");
      mine.textContent = `Pronosticaste ${m.prediction.home} — ${m.prediction.away}`;
      wrap.append(mine);
    }
    wrap.append(strong);

    /* Cruces: quién pasó y si lo acertó. */
    if (knockout && m.qualifier) {
      const passed = document.createElement("span");
      const byPens = m.homeGoals === m.awayGoals ? " (por penales)" : "";
      passed.textContent = `Pasó ${teamOf(m, m.qualifier)}${byPens}`;
      wrap.append(passed);

      const q = document.createElement("strong");
      const qp = m.prediction ? m.prediction.qualPoints : null;
      if (m.prediction && m.prediction.qualifier && qp > 0) {
        q.textContent = `🎟️ Acertaste quién pasa · +${qp} pts`;
        q.className = "result-hit";
      } else if (m.prediction && m.prediction.qualifier) {
        q.textContent = `❌ Elegiste ${teamOf(m, m.prediction.qualifier)} · 0 pts`;
        q.className = "result-miss";
      } else {
        q.textContent = "No elegiste quién pasa · 0 pts";
        q.className = "result-miss";
      }
      wrap.append(q);
    }
    return wrap;
  }

  /* Puntos totales de un pronóstico ya jugado (resultado + quién pasa). */
  function totalPts(p) {
    return (Number(p.points) || 0) + (Number(p.qualPoints) || 0);
  }

  function actionEl(m, homeInput, awayInput, picker) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "predict-action";
    btn.textContent = m.prediction ? "Actualizar pronóstico" : "Confirmar pronóstico";

    btn.addEventListener("click", async () => {
      const h = homeInput.value;
      const a = awayInput.value;
      if (h === "" || a === "") {
        flash(btn, "Cargá ambos resultados");
        return;
      }
      const qualifier = picker ? picker.get() : null;
      if (picker && !qualifier) {
        flash(btn, "Elegí quién pasa");
        return;
      }
      btn.disabled = true;
      const original = m.prediction ? "Actualizar pronóstico" : "Confirmar pronóstico";
      btn.textContent = "Guardando…";
      let data;
      try {
        const res = await fetch(PREDICT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ matchId: m.id, home: Number(h), away: Number(a), qualifier })
        });
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (data && data.ok) {
        m.prediction = { home: Number(h), away: Number(a), points: null, qualifier, qualPoints: null };
        btn.classList.add("confirmed");
        btn.textContent = "✓ Pronóstico guardado";
        window.setTimeout(() => {
          btn.classList.remove("confirmed");
          btn.textContent = "Actualizar pronóstico";
          btn.disabled = false;
        }, 1600);
      } else {
        btn.disabled = false;
        flash(btn, (data && data.error) ? data.error : "No se pudo guardar");
      }
    });

    return btn;
  }

  function flash(btn, msg) {
    const prev = btn.textContent;
    btn.textContent = msg;
    window.setTimeout(() => {
      if (!btn.disabled) btn.textContent = prev;
    }, 1600);
  }

  /* ---------------- Render general ---------------- */

  function renderRound(data) {
    const round = data.round;
    const matches = Array.isArray(data.matches) ? data.matches : [];
    currentMatches = matches;

    if (!round || !matches.length) {
      if (els.banner) els.banner.hidden = false;
      els.matches.innerHTML = "";
      if (els.empty) els.empty.hidden = false;
      return;
    }

    if (els.banner) els.banner.hidden = true;
    if (els.empty) els.empty.hidden = true;
    if (els.roundName) els.roundName.textContent = `${round.name} · ${round.competition}`;

    knockout = !!round.knockout;
    if (round.qualPoints) qualPoints = round.qualPoints;
    if (els.knockoutNote) els.knockoutNote.hidden = !knockout;
    if (els.howQual) els.howQual.hidden = !knockout;

    els.matches.innerHTML = "";
    const frag = document.createDocumentFragment();
    matches.forEach((m) => frag.append(matchCard(m)));
    els.matches.append(frag);

    // Stats del hero
    const you = data.you || { points: 0, hits: 0, total: matches.length };
    if (els.points) els.points.textContent = you.points;
    if (els.hits) els.hits.textContent = `${you.hits}/${you.total}`;

    renderHistory(matches);
  }

  function renderHistory(matches) {
    if (!els.history) return;
    const done = matches.filter((m) => m.status === "finished" && m.prediction);
    if (!done.length) {
      if (els.historySection) els.historySection.hidden = true;
      return;
    }
    if (els.historySection) els.historySection.hidden = false;
    els.history.innerHTML = "";
    done.forEach((m) => {
      const pts = m.prediction.points;
      const icon = pts === 10 ? "🎯" : pts === 5 ? "✅" : "❌";
      const cls = pts === 10 ? "hit" : pts === 5 ? "half" : "miss";
      const row = document.createElement("article");
      row.className = "history-row " + cls;
      const i = document.createElement("span");
      i.className = "history-icon";
      i.textContent = icon;
      const mid = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = `${m.home} ${m.homeGoals} — ${m.awayGoals} ${m.away}`;
      const sub = document.createElement("span");
      sub.textContent = `Pronosticaste ${m.prediction.home} — ${m.prediction.away}`;
      if (knockout && m.qualifier) {
        const ok = m.prediction.qualPoints > 0;
        sub.textContent += ` · Pasó ${teamOf(m, m.qualifier)} ${ok ? "🎟️" : "✗"}`;
      }
      mid.append(title, sub);
      const strong = document.createElement("strong");
      const tot = totalPts(m.prediction);
      strong.textContent = tot > 0 ? `+${tot} pts` : "0 pts";
      row.append(i, mid, strong);
      els.history.append(row);
    });
  }

  async function loadRound() {
    let data;
    try {
      const res = await fetch(ROUND_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      data = await res.json();
    } catch (e) {
      if (els.banner) els.banner.hidden = false;
      if (els.empty) els.empty.hidden = false;
      return;
    }
    renderRound(data);
  }

  /* Ranking GENERAL (acumulado de todas las fechas). También alimenta la
     "Tu posición" del hero, que es la del torneo entero. */
  async function loadRanking() {
    try {
      const res = await fetch(RANKING_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      rankingData.general = await res.json();
    } catch (e) {
      return;
    }
    const you = rankingData.general && rankingData.general.you;
    if (els.pos) els.pos.textContent = you ? `#${you.rank}` : "—";
    renderActiveRanking();
  }

  /* Ranking de la FECHA EN JUEGO (solo la fecha actual). */
  async function loadRankingFecha() {
    try {
      const res = await fetch(RANKING_FECHA_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      rankingData.fecha = await res.json();
    } catch (e) {
      return;
    }
    renderActiveRanking();
  }

  /* Dibuja el ranking del scope activo (con su nota y estado vacío propio). */
  function renderActiveRanking() {
    if (!els.ranking) return;
    const data = rankingData[activeScope];
    const rows = data && Array.isArray(data.ranking) ? data.ranking : [];

    if (els.rankingNote) {
      if (activeScope === "fecha") {
        const rn = data && data.round && data.round.name;
        els.rankingNote.textContent = rn
          ? `Solo la ${rn} — se actualiza a medida que se juega.`
          : "Solo la fecha que se está jugando ahora.";
      } else {
        els.rankingNote.textContent = "Acumulado de todas las fechas del torneo.";
      }
    }

    els.ranking.innerHTML = "";

    if (!rows.length) {
      if (els.rankingEmpty) els.rankingEmpty.hidden = false;
      if (els.rankingEmptyText) {
        els.rankingEmptyText.textContent = activeScope === "fecha"
          ? "Todavía no se jugaron partidos de esta fecha. En cuanto se juegue el primero, aparece acá."
          : "El ranking se arma cuando se jueguen los primeros partidos. ¡Cargá tus pronósticos para entrar!";
      }
      return;
    }

    if (els.rankingEmpty) els.rankingEmpty.hidden = true;
    rows.forEach((r) => els.ranking.append(rankingRow(r)));

    if (data.you && data.you.rank > rows.length) {
      els.ranking.append(rankingRow(data.you));
    }
  }

  /* Pestañas: cambian el scope activo y re-renderizan (los datos ya están cacheados). */
  function initRankingTabs() {
    els.rankTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const scope = btn.dataset.rankTab;
        if (scope === activeScope) return;
        activeScope = scope;
        els.rankTabs.forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderActiveRanking();
      });
    });
  }

  function rankingRow(r) {
    const art = document.createElement("article");
    art.className = "ranking-row" + (r.isYou ? " you" : "");
    const medal = r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : r.rank === 3 ? "bronze" : "";
    const pos = document.createElement("span");
    pos.className = "rank-pos " + medal;
    pos.textContent = r.rank;
    const avatar = document.createElement("span");
    avatar.className = "rank-avatar";
    avatar.textContent = r.avatar || "🍔";
    const name = document.createElement("b");
    name.textContent = r.isYou ? "Vos" : r.name;
    const pts = document.createElement("span");
    pts.className = "rank-points";
    pts.textContent = `${r.points} pts`;
    art.append(pos, avatar, name, pts);
    return art;
  }

  /* ---------------- Ganador de la fecha ---------------- */

  async function loadWinner() {
    if (!els.winner) return;
    let data;
    try {
      const res = await fetch(WINNER_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      data = await res.json();
    } catch (e) {
      return;
    }

    const w = data && data.winner;
    if (!w || !w.name) {
      els.winner.hidden = true;
      return;
    }

    if (els.winnerRound) {
      els.winnerRound.textContent = w.roundName
        ? `Ganador · ${w.roundName}`
        : "Ganador de la fecha";
    }
    if (els.winnerAvatar) els.winnerAvatar.textContent = w.avatar || "🍔";
    if (els.winnerName) els.winnerName.textContent = w.name;
    if (els.winnerSub) {
      const exacts = Number(w.exacts) || 0;
      const exactsTxt = exacts > 0
        ? ` · ${exacts} ${exacts === 1 ? "resultado exacto" : "resultados exactos"}`
        : "";
      els.winnerSub.textContent = `Sumó ${w.points} pts${exactsTxt} y se llevó el premio de la fecha. 🍔`;
    }

    els.winner.hidden = false;
  }

  /* ---------------- Arranque ---------------- */

  initRankingTabs();
  loadRound();
  loadRanking();
  loadRankingFecha();
  loadWinner();
})();
