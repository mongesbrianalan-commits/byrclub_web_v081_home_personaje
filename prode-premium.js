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
  const PREDICT_URL = "/api/prode/predict.php";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    banner: $("[data-prode-banner]"),
    roundName: $("[data-prode-round-name]"),
    matches: $("[data-prode-matches]"),
    empty: $("[data-prode-empty]"),
    ranking: $("[data-prode-ranking]"),
    rankingEmpty: $("[data-prode-ranking-empty]"),
    historySection: $("[data-prode-history-section]"),
    history: $("[data-prode-history]"),
    pos: $("[data-prode-position]"),
    points: $("[data-prode-points]"),
    hits: $("[data-prode-hits]")
  };

  if (!els.matches) return; // no estamos en la página del prode

  let currentMatches = [];

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
      art.append(actionEl(m, homeInput, awayInput));
    } else {
      const note = document.createElement("div");
      note.className = "match-result";
      const line = document.createElement("span");
      line.textContent = m.prediction
        ? `Tu pronóstico: ${m.prediction.home} — ${m.prediction.away}`
        : "No cargaste pronóstico para este partido.";
      const strong = document.createElement("strong");
      strong.textContent = "⏳ Partido en juego";
      note.append(line, strong);
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
    return wrap;
  }

  function actionEl(m, homeInput, awayInput) {
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
      btn.disabled = true;
      const original = m.prediction ? "Actualizar pronóstico" : "Confirmar pronóstico";
      btn.textContent = "Guardando…";
      let data;
      try {
        const res = await fetch(PREDICT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ matchId: m.id, home: Number(h), away: Number(a) })
        });
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (data && data.ok) {
        m.prediction = { home: Number(h), away: Number(a), points: null };
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
      mid.append(title, sub);
      const strong = document.createElement("strong");
      strong.textContent = pts === 10 ? "+10 pts" : pts === 5 ? "+5 pts" : "0 pts";
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

  async function loadRanking() {
    if (!els.ranking) return;
    let data;
    try {
      const res = await fetch(RANKING_URL, { credentials: "same-origin" });
      if (res.status === 401) return;
      data = await res.json();
    } catch (e) {
      return;
    }

    const rows = Array.isArray(data.ranking) ? data.ranking : [];
    if (!rows.length) {
      if (els.rankingEmpty) els.rankingEmpty.hidden = false;
      els.ranking.innerHTML = "";
      return;
    }
    if (els.rankingEmpty) els.rankingEmpty.hidden = true;

    els.ranking.innerHTML = "";
    rows.forEach((r) => els.ranking.append(rankingRow(r)));

    if (data.you && data.you.rank > rows.length) {
      els.ranking.append(rankingRow(data.you));
    }

    if (els.pos) els.pos.textContent = data.you ? `#${data.you.rank}` : "—";
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

  /* ---------------- Arranque ---------------- */

  loadRound();
  loadRanking();
})();
