(() => {
  "use strict";

  /* =========================================================
     BYR Club — Pedidos online (pedir.html)
     ---------------------------------------------------------
     Trae el menú de /api/menu.php, deja armar un carrito, y envía
     el pedido a /api/orders/create.php. Los precios SIEMPRE los
     recalcula el servidor: acá solo mandamos slug + cantidad.
     El pedido queda 'pending' hasta que el admin lo confirme y
     acredite los puntos.
  ========================================================= */

  const $ = (sel, root = document) => root.querySelector(sel);

  const menuList     = $("[data-menu-list]");
  const menuLoading  = $("[data-menu-loading]");
  const menuError    = $("[data-menu-error]");
  const cartItemsEl  = $("[data-cart-items]");
  const cartEmptyEl  = $("[data-cart-empty]");
  const cartTotalEl  = $("[data-cart-total]");
  const pointsHint   = $("[data-cart-points-hint]");
  const checkoutForm = $("[data-checkout-form]");
  const addressField = $("[data-address-field]");
  const addressInput = $("[data-address]");
  const phoneInput   = $("[data-phone]");
  const couponField  = $("[data-coupon-field]");
  const couponSelect = $("[data-coupon]");
  const notesInput   = $("[data-notes]");
  const submitBtn    = $("[data-submit]");
  const statusEl     = $("[data-order-status]");
  const successEl    = $("[data-order-success]");
  const layoutEl     = $(".order-layout");
  const heroEl       = $(".order-hero");

  if (!menuList) return;

  /* cart: slug -> { slug, name, price, emoji, image, qty } */
  const cart = new Map();
  let pointsPerAmount = 100;

  /* --- Utilidades --- */

  function money(n) {
    // Pesos argentinos con separador de miles: 8500 -> "$8.500"
    return "$" + Number(n || 0).toLocaleString("es-AR");
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("is-error", "is-ok");
    if (kind) statusEl.classList.add(kind === "error" ? "is-error" : "is-ok");
  }

  /* --- Render del menú --- */

  function productCard(p) {
    const card = document.createElement("article");
    card.className = "product-card";

    const thumb = document.createElement("div");
    thumb.className = "product-thumb";
    if (p.image) {
      const img = document.createElement("img");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      // Si la imagen no está, mostramos el emoji.
      img.addEventListener("error", () => {
        thumb.innerHTML = "";
        const em = document.createElement("span");
        em.className = "product-emoji";
        em.textContent = p.emoji || "🍔";
        thumb.append(em);
      });
      thumb.append(img);
    } else {
      const em = document.createElement("span");
      em.className = "product-emoji";
      em.textContent = p.emoji || "🍔";
      thumb.append(em);
    }

    const body = document.createElement("div");
    body.className = "product-body";
    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = p.name;
    const desc = document.createElement("p");
    desc.className = "product-desc";
    desc.textContent = p.description || "";

    const foot = document.createElement("div");
    foot.className = "product-foot";
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = money(p.price);
    foot.append(price, stepperFor(p));

    body.append(name, desc, foot);
    card.append(thumb, body);
    return card;
  }

  /* Control +/- por producto. Refleja la cantidad que hay en el carrito. */
  function stepperFor(p) {
    const wrap = document.createElement("div");
    wrap.dataset.stepperFor = p.slug;

    const inCart = cart.get(p.slug);
    if (!inCart || inCart.qty <= 0) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "qty-add";
      add.textContent = "Agregar +";
      add.addEventListener("click", () => { changeQty(p, 1); });
      wrap.append(add);
    } else {
      wrap.append(qtyControls(p, inCart.qty));
    }
    return wrap;
  }

  function qtyControls(p, qty) {
    const box = document.createElement("div");
    box.className = "qty-stepper";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-btn";
    minus.setAttribute("aria-label", "Quitar uno");
    minus.textContent = "−";
    minus.addEventListener("click", () => { changeQty(p, -1); });
    const num = document.createElement("span");
    num.className = "qty-num";
    num.textContent = String(qty);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-btn";
    plus.setAttribute("aria-label", "Agregar uno");
    plus.textContent = "+";
    plus.addEventListener("click", () => { changeQty(p, 1); });
    box.append(minus, num, plus);
    return box;
  }

  function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
  }

  function renderMenu(categories) {
    menuList.textContent = "";
    categories.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "menu-category";
      const h2 = document.createElement("h2");
      h2.textContent = cat.label;
      const grid = document.createElement("div");
      grid.className = "menu-grid";
      cat.products.forEach((p) => {
        const card = productCard(p);
        // Enlazamos el producto al holder del stepper para redibujarlo luego.
        const holder = card.querySelector("[data-stepper-for]");
        if (holder) holder.__product = p;
        grid.append(card);
      });
      section.append(h2, grid);
      menuList.append(section);
    });
  }

  /* --- Carrito --- */

  function changeQty(p, delta) {
    const cur = cart.get(p.slug);
    const qty = (cur ? cur.qty : 0) + delta;
    if (qty <= 0) {
      cart.delete(p.slug);
    } else {
      cart.set(p.slug, {
        slug: p.slug, name: p.name, price: p.price,
        emoji: p.emoji, image: p.image, qty: Math.min(qty, 50),
      });
    }
    // Redibujamos el stepper de ESE producto en la carta.
    const holder = menuList.querySelector('[data-stepper-for="' + cssEscape(p.slug) + '"]');
    if (holder) {
      const fresh = stepperFor(p);
      fresh.__product = p;
      holder.replaceWith(fresh);
    }
    renderCart();
  }

  function cartTotal() {
    let t = 0;
    cart.forEach((it) => { t += it.price * it.qty; });
    return t;
  }

  function renderCart() {
    cartItemsEl.textContent = "";
    if (cart.size === 0) {
      cartItemsEl.append(cartEmptyEl);
      show(cartEmptyEl, true);
      cartTotalEl.textContent = money(0);
      show(pointsHint, false);
      show(checkoutForm, false);
      return;
    }
    show(cartEmptyEl, false);

    cart.forEach((it) => {
      const line = document.createElement("div");
      line.className = "cart-line";
      const em = document.createElement("span");
      em.className = "cl-emoji";
      em.textContent = it.emoji || "🍔";
      const info = document.createElement("div");
      info.className = "cl-info";
      const nm = document.createElement("div");
      nm.className = "cl-name";
      nm.textContent = it.name;
      const pr = document.createElement("div");
      pr.className = "cl-price";
      pr.textContent = money(it.price) + " × " + it.qty + " = " + money(it.price * it.qty);
      info.append(nm, pr);
      // Reutilizamos el control +/- (necesita el "producto").
      const controls = qtyControls(it, it.qty);
      line.append(em, info, controls);
      cartItemsEl.append(line);
    });

    const total = cartTotal();
    cartTotalEl.textContent = money(total);

    const pts = Math.floor(total / pointsPerAmount);
    if (pts > 0) {
      pointsHint.textContent = "🎉 Con este pedido sumás ~" + pts.toLocaleString("es-AR") + " puntos al confirmarse.";
      show(pointsHint, true);
    } else {
      show(pointsHint, false);
    }

    show(checkoutForm, true);
  }

  /* --- Cupones disponibles para adjuntar --- */

  async function loadCoupons() {
    try {
      const res = await fetch("/api/redemptions.php", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const avail = (data.coupons || []).filter(
        (c) => c.status === "pending" && !c.expired &&
               !(typeof c.secondsLeft === "number" && c.secondsLeft <= 0)
      );
      if (!avail.length) return;
      avail.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = (c.icon ? c.icon + " " : "") + c.label + " (" + c.code + ")";
        couponSelect.append(opt);
      });
      show(couponField, true);
    } catch (e) { /* sin cupones, seguimos */ }
  }

  /* --- Gate de admin (mientras los pedidos están en revisión) ---
     La página arranca oculta (<main hidden>). Solo la mostramos si sos admin;
     un socio que llegue por la URL es redirigido al inicio. También precarga
     el WhatsApp de la cuenta. Para publicar: quitar este gate y el `hidden`
     del <main> en pedir.html. */
  async function ensureAllowed() {
    const mainEl = document.querySelector("[data-order-main]");
    try {
      const res = await fetch("/api/me.php", { credentials: "same-origin" });
      const data = await res.json();
      const u = data.user;
      if (!u) { window.location.replace("ingresar.html?next=/pedir.html"); return false; }
      if (!u.isAdmin) { window.location.replace("index.html"); return false; }
      if (u.whatsapp && !phoneInput.value) phoneInput.value = u.whatsapp;
      if (mainEl) mainEl.hidden = false;
      return true;
    } catch (e) {
      window.location.replace("index.html");
      return false;
    }
  }

  /* --- Toggle retiro / delivery --- */

  function initFulfillment() {
    const opts = document.querySelectorAll("[data-fulfill-opt]");
    opts.forEach((opt) => {
      const input = opt.querySelector("input");
      input.addEventListener("change", () => {
        opts.forEach((o) => o.classList.toggle("is-active", o === opt));
        const isDelivery = opt.getAttribute("data-fulfill-opt") === "delivery";
        show(addressField, isDelivery);
      });
    });
  }

  function currentFulfillment() {
    const checked = document.querySelector('input[name="fulfillment"]:checked');
    return checked ? checked.value : "pickup";
  }

  /* --- Enviar pedido --- */

  async function submitOrder(ev) {
    ev.preventDefault();
    setStatus("");

    if (cart.size === 0) {
      setStatus("Tu pedido está vacío.", "error");
      return;
    }
    const fulfillment = currentFulfillment();
    const address = addressInput.value.trim();
    if (fulfillment === "delivery" && !address) {
      setStatus("Para delivery necesitamos tu dirección.", "error");
      addressInput.focus();
      return;
    }

    const items = [];
    cart.forEach((it) => { items.push({ slug: it.slug, qty: it.qty }); });

    const payload = {
      items,
      fulfillment,
      address: fulfillment === "delivery" ? address : "",
      phone: phoneInput.value.trim(),
      notes: notesInput.value.trim(),
      couponCode: couponSelect.value || "",
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
    try {
      const res = await fetch("/api/orders/create.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data.error || "No pudimos enviar tu pedido. Probá de nuevo.", "error");
        return;
      }
      showSuccess(data.order);
    } catch (e) {
      setStatus("No hay conexión. Probá de nuevo en un momento.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar pedido 🍔";
    }
  }

  function showSuccess(order) {
    const idEl = $("[data-success-id]");
    if (idEl) idEl.textContent = "#" + order.id;

    const summary = $("[data-success-summary]");
    if (summary) {
      summary.textContent = "";
      (order.items || []).forEach((ln) => {
        const row = document.createElement("div");
        row.className = "ss-line";
        const a = document.createElement("span");
        a.textContent = ln.qty + "× " + ln.name;
        const b = document.createElement("span");
        b.textContent = money(ln.subtotal);
        row.append(a, b);
        summary.append(row);
      });
      const totalRow = document.createElement("div");
      totalRow.className = "ss-line ss-total";
      const ta = document.createElement("span");
      ta.textContent = order.fulfillment === "delivery" ? "Total (delivery)" : "Total (retiro)";
      const tb = document.createElement("b");
      tb.textContent = money(order.itemsTotal);
      totalRow.append(ta, tb);
      summary.append(totalRow);
      if (order.couponLabel) {
        const cRow = document.createElement("div");
        cRow.className = "ss-line";
        cRow.innerHTML = "<span>🎟️ Cupón adjunto</span><span>" + escapeHtml(order.couponLabel) + "</span>";
        summary.append(cRow);
      }
    }

    // Ocultamos carta + carrito, mostramos el éxito.
    show(layoutEl, false);
    show(heroEl, false);
    show(successEl, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function resetForNewOrder() {
    cart.clear();
    couponSelect.value = "";
    notesInput.value = "";
    addressInput.value = "";
    show(successEl, false);
    show(layoutEl, true);
    show(heroEl, true);
    renderCart();
    // Redibujamos los steppers de la carta (todos vuelven a "Agregar +").
    menuList.querySelectorAll("[data-stepper-for]").forEach((holder) => {
      const p = holder.__product;
      if (!p) return;
      const fresh = stepperFor(p);
      fresh.__product = p;
      holder.replaceWith(fresh);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* --- Carga inicial --- */

  async function loadMenu() {
    try {
      const res = await fetch("/api/menu.php", { credentials: "same-origin" });
      if (res.status === 401) return; // el guard ya redirige
      const data = await res.json();
      pointsPerAmount = Number(data.pointsPerAmount) || 100;
      const cats = Array.isArray(data.categories) ? data.categories : [];
      show(menuLoading, false);
      if (!cats.length) {
        menuError.textContent = "El menú todavía no está cargado. Volvé en un ratito.";
        show(menuError, true);
        return;
      }
      renderMenu(cats);
    } catch (e) {
      show(menuLoading, false);
      show(menuError, true);
    }
  }

  async function init() {
    // Gate de admin: si no está permitido, ya se redirigió; no cargamos nada.
    const allowed = await ensureAllowed();
    if (!allowed) return;

    initFulfillment();
    loadMenu();
    loadCoupons();
    renderCart();
    checkoutForm.addEventListener("submit", submitOrder);
    const newOrderBtn = $("[data-new-order]");
    if (newOrderBtn) newOrderBtn.addEventListener("click", resetForNewOrder);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
