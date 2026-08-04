(() => {
  "use strict";

  /* =========================================================
     BYR Club — Perks en el perfil
     ---------------------------------------------------------
     - Muestra el código/link de invitación (traé un amigo).
     - Muestra un cartel en el mes de cumpleaños.
     Lee los datos autoritativos de /api/me.php (referralCode,
     birthdate). Auto-inyecta su propio CSS para no depender
     de otra hoja de estilos.
  ========================================================= */

  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  injectCSS();
  init();

  async function init() {
    let user = null;
    try {
      const res = await fetch("api/me.php", { credentials: "same-origin" });
      const data = await res.json();
      user = data && data.user ? data.user : null;
    } catch (error) {
      user = null;
    }
    if (!user) return;

    setupReferral(user);
    setupBirthday(user);
  }

  /* ---------------------------------------------------------
     Traé un amigo
  --------------------------------------------------------- */

  function setupReferral(user) {
    const card = document.querySelector("[data-referral-card]");
    const code = user.referralCode;
    if (!card || !code) return;

    const link = `${location.origin}/ingresar.html?ref=${encodeURIComponent(code)}`;
    const message =
      `¡Sumate al BYR Club! Usá mi código ${code} y arrancás con puntos de regalo 🍔🎁 ${link}`;

    const codeEl = card.querySelector("[data-referral-code]");
    const copyBtn = card.querySelector("[data-referral-copy]");
    const waLink = card.querySelector("[data-referral-wa]");
    const feedback = card.querySelector("[data-referral-feedback]");

    if (codeEl) codeEl.textContent = code;
    if (waLink) waLink.href = `https://wa.me/?text=${encodeURIComponent(message)}`;

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const ok = await copyText(link);
        if (feedback) {
          feedback.textContent = ok
            ? "¡Link copiado! Mandáselo a tu amigo."
            : `Copialo a mano: ${link}`;
          feedback.classList.toggle("is-ok", ok);
        }
      });
    }

    card.hidden = false;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* seguimos al fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (error) {
      return false;
    }
  }

  /* ---------------------------------------------------------
     Cumpleaños
  --------------------------------------------------------- */

  function setupBirthday(user) {
    const banner = document.querySelector("[data-profile-birthday-banner]");
    const raw = user.birthdate;
    if (!banner || !raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;

    const [, mm, dd] = raw.split("-").map((n) => parseInt(n, 10));
    const now = new Date();
    if (mm !== now.getMonth() + 1) return; // solo en el mes de cumple

    const name = (user.name || "").trim();
    const title = banner.querySelector("[data-birthday-title]");
    const sub = banner.querySelector("[data-birthday-sub]");
    if (title) title.textContent = name ? `¡Feliz cumple, ${name}!` : "¡Feliz cumple!";
    if (sub) {
      sub.textContent =
        `Tu regalo de socio te espera en el local durante ${MESES[mm - 1]} (tu día es el ${dd}). 🎁`;
    }
    banner.hidden = false;
  }

  /* ---------------------------------------------------------
     Estilos
  --------------------------------------------------------- */

  function injectCSS() {
    const css = `
    .birthday-banner {
      display: flex; align-items: center; gap: 16px;
      margin: 0 0 28px;
      padding: 18px 22px;
      border-radius: 20px;
      background: linear-gradient(120deg, var(--pink), var(--purple));
      box-shadow: 0 8px 0 rgba(0,0,0,.22);
    }
    .birthday-banner .birthday-emoji { font-size: 2.4rem; line-height: 1; }
    .birthday-banner .birthday-text { display: flex; flex-direction: column; gap: 2px; }
    .birthday-banner strong { font-family: "Lilita One"; font-size: 1.3rem; }
    .birthday-banner span { color: #fff; font-weight: 700; opacity: .95; }

    .referral-section { margin: 34px 0; }
    .referral-inner {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 26px;
      align-items: center;
      padding: 30px 32px;
      border-radius: 26px;
      border: 3px solid rgba(255,255,255,.1);
      background: linear-gradient(150deg, var(--blue-800), var(--blue-950));
      box-shadow: 0 12px 0 rgba(0,0,0,.24);
    }
    .referral-kicker { font-weight: 900; letter-spacing: .06em; color: var(--yellow); }
    .referral-copy h2 { font-family: "Lilita One"; font-size: 1.9rem; margin: 6px 0 8px; }
    .referral-copy p { color: #cfe6ff; font-weight: 600; line-height: 1.35; margin: 0; }
    .referral-copy strong { color: #fff; }
    .referral-actions { display: flex; flex-direction: column; gap: 14px; }
    .referral-code-box {
      display: flex; flex-direction: column; gap: 2px;
      padding: 14px 20px; border-radius: 16px;
      background: rgba(0,0,0,.28); border: 2px dashed rgba(255,255,255,.25);
      text-align: center;
    }
    .referral-code-box span { font-weight: 800; font-size: .8rem; color: #9fc4ff; text-transform: uppercase; letter-spacing: .08em; }
    .referral-code-box strong { font-family: "Lilita One"; font-size: 1.9rem; letter-spacing: .1em; color: var(--yellow); }
    .referral-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
    .referral-btn {
      flex: 1; min-width: 130px;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 13px 16px; border: 0; border-radius: 14px;
      font-family: inherit; font-weight: 900; font-size: .95rem; cursor: pointer;
      text-decoration: none; color: #081242; background: var(--yellow);
      box-shadow: 0 6px 0 #b88900; transition: transform .15s;
    }
    .referral-btn-wa { color: #fff; background: #25d366; box-shadow: 0 6px 0 #128c3e; }
    .referral-btn:hover { transform: translateY(-3px); }
    .referral-feedback { min-height: 18px; font-weight: 800; color: #ffd97a; }
    .referral-feedback.is-ok { color: var(--green); }

    @media (max-width: 820px) {
      .referral-inner { grid-template-columns: 1fr; }
    }
    `;
    const style = document.createElement("style");
    style.setAttribute("data-perks-profile", "");
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
