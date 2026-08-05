(() => {
  "use strict";

  /*
   * Trae el ranking de la comunidad desde /api/ranking.php y lo dibuja.
   * Ordenado por NIVEL/XP (el XP no baja al canjear). Resalta tu fila y,
   * si quedás fuera del Top, muestra tu posición aparte.
   */

  const listEl = document.querySelector("[data-ranking-list]");
  const stateEl = document.querySelector("[data-ranking-state]");
  const youOutEl = document.querySelector("[data-ranking-you-out]");

  function formatNumber(value) {
    return (Number(value) || 0).toLocaleString("es-AR");
  }

  function medalClass(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "";
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function rowHtml(entry) {
    const youClass = entry.isYou ? " you" : "";
    const medal = medalClass(entry.rank);
    const name = entry.isYou ? "Vos" : escapeHtml(entry.name);

    return (
      `<article class="ranking-row${youClass}">` +
        `<span class="rank-pos ${medal}">${entry.rank}</span>` +
        `<span class="rank-avatar">${escapeHtml(entry.avatar || "🍔")}</span>` +
        `<div class="rank-id">` +
          `<b>${name}</b>` +
          `<small>${formatNumber(entry.xp)} XP</small>` +
        `</div>` +
        `<span class="rank-level">Nivel ${entry.level}</span>` +
      `</article>`
    );
  }

  function setState(message, isError) {
    if (!stateEl) return;
    stateEl.textContent = message || "";
    stateEl.hidden = !message;
    stateEl.classList.toggle("error", Boolean(isError));
  }

  function render(data) {
    const ranking = Array.isArray(data.ranking) ? data.ranking : [];

    if (!ranking.length) {
      setState("Todavía no hay nadie en el ranking. ¡Sé el primero en sumar XP!", false);
      return;
    }

    setState("", false);
    listEl.innerHTML = ranking.map(rowHtml).join("");

    /*
     * Si el usuario quedó fuera del Top mostrado, agregamos su posición
     * en un bloque aparte al final.
     */
    if (youOutEl) {
      const you = data.you;
      const inTop = you && ranking.some((r) => r.isYou);

      if (you && !inTop) {
        youOutEl.innerHTML =
          `<p class="ranking-you-caption">Tu posición</p>` +
          `<div class="ranking-list">${rowHtml({ ...you, isYou: true })}</div>`;
        youOutEl.hidden = false;
      } else {
        youOutEl.hidden = true;
        youOutEl.innerHTML = "";
      }
    }
  }

  async function load() {
    setState("Cargando ranking…", false);

    try {
      const res = await fetch("/api/ranking.php", { credentials: "same-origin" });
      let data = {};
      try {
        data = await res.json();
      } catch (error) {
        /* respuesta no-JSON */
      }

      if (!res.ok) {
        setState(data.error || "No se pudo cargar el ranking.", true);
        return;
      }

      render(data);
    } catch (error) {
      setState("No se pudo cargar el ranking. Revisá tu conexión.", true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }

  // Si el usuario suma XP en otra pestaña/acción, refrescamos al volver.
  window.addEventListener("byr:user-updated", load);
})();
