(() => {
  "use strict";

  /* =========================================================
     BYR Club — Activar avisos en el celular (push).

     Dibuja el estado en cualquier elemento [data-push-box] de la página:
       - botón "Activar avisos" / "Desactivar"
       - en iPhone sin instalar: cómo instalar la app (Apple solo deja
         mandar avisos a la app instalada en la pantalla de inicio)
       - si el socio los bloqueó: cómo volver a habilitarlos
     El texto de "para qué sirven" lo pone cada página dentro de la caja.
  ========================================================= */

  const boxes = Array.from(document.querySelectorAll("[data-push-box]"));
  if (!boxes.length) return;

  const KEY_URL = "/api/push/key.php";
  const SUB_URL = "/api/push/subscribe.php";
  const UNSUB_URL = "/api/push/unsubscribe.php";

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  let publicKey = null;

  function urlB64ToUint8Array(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no-JSON */ }
    if (!res.ok) throw new Error(data.error || "No se pudo completar.");
    return data;
  }

  async function currentSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error(perm === "denied"
        ? "Bloqueaste los avisos. Habilitalos desde la configuración del navegador."
        : "No se activaron los avisos.");
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey)
      });
    }
    await post(SUB_URL, Object.assign(sub.toJSON(), { welcome: true }));
  }

  async function disable() {
    const sub = await currentSub();
    if (!sub) return;
    try { await post(UNSUB_URL, { endpoint: sub.endpoint }); } catch (e) { /* igual la damos de baja acá */ }
    await sub.unsubscribe();
  }

  /* ---------------- UI ---------------- */

  function ui(box) {
    let slot = box.querySelector("[data-push-slot]");
    if (!slot) {
      slot = document.createElement("div");
      slot.setAttribute("data-push-slot", "");
      box.append(slot);
    }
    return slot;
  }

  function render(state, msg) {
    boxes.forEach((box) => {
      const slot = ui(box);
      slot.textContent = "";
      slot.className = "push-slot";

      if (state === "hidden" || (state === "on" && !msg && box.hasAttribute("data-push-hide-when-on"))) {
        box.hidden = true;
        return;
      }
      box.hidden = false;

      const p = document.createElement("p");
      p.className = "push-note";

      if (state === "ios-install") {
        p.innerHTML = "📲 En iPhone, los avisos llegan a la <b>app instalada</b>: tocá <b>Compartir</b> " +
          "(el cuadrado con la flecha) → <b>Agregar a inicio</b>, abrí BYR Club desde ese ícono y activalos ahí.";
        slot.append(p);
        return;
      }
      if (state === "denied") {
        p.textContent = "🔕 Tenés los avisos bloqueados para BYR Club. Para recibirlos, habilitalos en la configuración del navegador (o de la app) y volvé a esta página.";
        slot.append(p);
        return;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "push-btn" + (state === "on" ? " is-on" : "");
      btn.textContent = state === "on" ? "Desactivar avisos" : "🔔 Activar avisos";
      btn.addEventListener("click", () => toggle(state === "on", btn));
      slot.append(btn);

      if (state === "on") {
        p.textContent = "✅ Los avisos están activados en este dispositivo.";
        slot.prepend(p);
      }
      if (msg) {
        const m = document.createElement("p");
        m.className = "push-msg";
        m.textContent = msg;
        slot.append(m);
      }
    });
  }

  async function toggle(isOn, btn) {
    btn.disabled = true;
    btn.textContent = isOn ? "Desactivando…" : "Activando…";
    try {
      if (isOn) {
        await disable();
        render("off", "Listo, no te vamos a mandar más avisos a este dispositivo.");
      } else {
        await enable();
        render("on", "¡Listo! Te mandamos un aviso de prueba.");
      }
    } catch (e) {
      const st = (window.Notification && Notification.permission === "denied") ? "denied" : (isOn ? "on" : "off");
      render(st, e.message);
    }
  }

  async function init() {
    if (!supported) {
      render(isIOS && !isStandalone ? "ios-install" : "hidden");
      return;
    }
    try {
      const res = await fetch(KEY_URL, { credentials: "same-origin" });
      const data = await res.json();
      if (!data.ready || !data.publicKey || !data.loggedIn) {
        render("hidden");
        return;
      }
      publicKey = data.publicKey;
    } catch (e) {
      render("hidden");
      return;
    }

    if (Notification.permission === "denied") {
      render("denied");
      return;
    }
    let sub = null;
    try { sub = await currentSub(); } catch (e) { /* sin SW todavía */ }
    if (sub && Notification.permission === "granted") {
      render("on");
      /* Re-asocia el dispositivo al socio logueado (si cambió de cuenta). */
      post(SUB_URL, sub.toJSON()).catch(() => {});
    } else {
      render("off");
    }
  }

  init();
})();
