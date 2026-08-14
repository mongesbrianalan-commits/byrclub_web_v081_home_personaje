(() => {
  "use strict";

  /* =========================================================
     BYR Club — Pedidos online (pedir.html)
     ---------------------------------------------------------
     Trae el menú de /api/menu.php, deja armar un carrito y envía el pedido a
     /api/orders/create.php. Las burgers abren un POPUP de opciones (papas,
     bebida, adicionales). Los precios los recalcula SIEMPRE el servidor: acá
     solo mandamos slug + cantidad + qué opciones se eligieron.
     El pedido queda 'pending' hasta que el admin lo confirme.
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
  const pickupField  = $("[data-pickup-field]");
  const pickupInput  = $("[data-pickup-name]");
  const phoneInput   = $("[data-phone]");
  const couponField  = $("[data-coupon-field]");
  const couponSelect = $("[data-coupon]");
  const notesInput   = $("[data-notes]");
  const cartFab      = $("[data-cart-fab]");
  const cartFabCount = $("[data-cart-fab-count]");
  const cartFabTotal = $("[data-cart-fab-total]");
  const cartOverlay  = $("[data-cart-overlay]");
  const cartCloseBtn = $("[data-cart-close]");
  const orderCartEl  = document.querySelector(".order-cart");
  const submitBtn    = $("[data-submit]");
  const statusEl     = $("[data-order-status]");
  const successEl    = $("[data-order-success]");
  const layoutEl     = $(".order-layout");
  const heroEl       = $(".order-hero");

  if (!menuList) return;

  /* cart: lineId -> { lineId, slug, name, unitPrice, qty, optionsText, optionsPayload, isOption } */
  const cart = new Map();
  let pointsPerAmount = 100;
  let optionSets = {};
  const productBySlug = new Map();

  /* --- Utilidades --- */

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-AR"); }
  function show(el, visible) { if (el) el.hidden = !visible; }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("is-error", "is-ok");
    if (kind) statusEl.classList.add(kind === "error" ? "is-error" : "is-ok");
  }

  function hasOptions(p) {
    return p.optionSet && Array.isArray(optionSets[p.optionSet]) && optionSets[p.optionSet].length;
  }

  /* =========================================================
     Render del menú
  ========================================================= */

  function productCard(p) {
    const card = document.createElement("article");
    card.className = "product-card";

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
    // Con opciones, el precio final puede subir: lo mostramos como "desde".
    price.textContent = (hasOptions(p) ? "desde " : "") + money(p.price);
    foot.append(price, actionFor(p));

    body.append(name, desc, foot);
    card.append(body);
    return card;
  }

  // Acción de la tarjeta: popup (con opciones) o control +/- (directo).
  function actionFor(p) {
    if (hasOptions(p)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-add";
      btn.textContent = "Agregar +";
      btn.addEventListener("click", () => openOptionsModal(p));
      return btn;
    }
    // Producto simple: holder con stepper que refleja la cantidad en el carrito.
    const holder = document.createElement("div");
    holder.setAttribute("data-stepper-for", p.slug);
    holder.__product = p;
    holder.append(simpleStepper(p));
    return holder;
  }

  function simpleStepper(p) {
    const lineId = "p:" + p.slug;
    const line = cart.get(lineId);
    if (!line || line.qty <= 0) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "qty-add";
      add.textContent = "Agregar +";
      add.addEventListener("click", () => addSimple(p));
      return add;
    }
    return qtyControls(lineId, () => refreshSimpleStepper(p.slug));
  }

  function refreshSimpleStepper(slug) {
    const holder = menuList.querySelector('[data-stepper-for="' + cssEscape(slug) + '"]');
    if (!holder || !holder.__product) return;
    const fresh = actionFor(holder.__product);
    holder.replaceWith(fresh);
  }

  function renderMenu(categories) {
    menuList.textContent = "";

    // Navegación de categorías (pestañitas tipo Que Resto).
    const nav = document.createElement("nav");
    nav.className = "menu-nav";
    nav.setAttribute("aria-label", "Categorías");
    categories.forEach((cat, i) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "menu-nav-pill" + (i === 0 ? " is-active" : "");
      pill.textContent = cat.label;
      pill.dataset.target = "menu-cat-" + cat.slug;
      pill.addEventListener("click", () => {
        const sec = document.getElementById("menu-cat-" + cat.slug);
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.append(pill);
    });
    menuList.append(nav);

    categories.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "menu-category";
      section.id = "menu-cat-" + cat.slug;
      const h2 = document.createElement("h2");
      h2.textContent = cat.label;
      const grid = document.createElement("div");
      grid.className = "menu-grid";
      cat.products.forEach((p) => {
        productBySlug.set(p.slug, p);
        grid.append(productCard(p));
      });
      section.append(h2, grid);
      menuList.append(section);
    });

    setupMenuNavObserver(nav);
  }

  // Marca activa la pestañita de la categoría visible al hacer scroll.
  function setupMenuNavObserver(nav) {
    if (!nav || !("IntersectionObserver" in window)) return;
    const sections = menuList.querySelectorAll(".menu-category");
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        nav.querySelectorAll(".menu-nav-pill").forEach((p) =>
          p.classList.toggle("is-active", p.dataset.target === e.target.id));
      });
    }, { rootMargin: "-15% 0px -75% 0px", threshold: 0 });
    sections.forEach((s) => obs.observe(s));
  }

  /* =========================================================
     Carrito (por líneas)
  ========================================================= */

  // Firma estable de una selección de opciones, para juntar líneas idénticas.
  function signature(payload) {
    const keys = Object.keys(payload).sort();
    return keys.map((k) => {
      const v = payload[k];
      return k + "=" + (Array.isArray(v) ? v.slice().sort().join(",") : String(v));
    }).join("|");
  }

  function addSimple(p) {
    const lineId = "p:" + p.slug;
    const existing = cart.get(lineId);
    if (existing) {
      existing.qty = Math.min(existing.qty + 1, 50);
    } else {
      cart.set(lineId, {
        lineId, slug: p.slug, name: p.name, unitPrice: p.price,
        qty: 1, optionsText: "", optionsPayload: {}, isOption: false,
      });
    }
    refreshSimpleStepper(p.slug);
    renderCart();
  }

  function changeLineQty(lineId, delta) {
    const line = cart.get(lineId);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) {
      cart.delete(lineId);
    } else {
      line.qty = Math.min(line.qty, 50);
    }
    if (!line.isOption) refreshSimpleStepper(line.slug);
    renderCart();
  }

  // Controles +/- para una línea del carrito (o el stepper de un producto simple).
  function qtyControls(lineId, afterChange) {
    const line = cart.get(lineId);
    const qty = line ? line.qty : 0;
    const box = document.createElement("div");
    box.className = "qty-stepper";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-btn";
    minus.setAttribute("aria-label", "Quitar uno");
    minus.textContent = "−";
    minus.addEventListener("click", () => { changeLineQty(lineId, -1); if (afterChange) afterChange(); });
    const num = document.createElement("span");
    num.className = "qty-num";
    num.textContent = String(qty);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-btn";
    plus.setAttribute("aria-label", "Agregar uno");
    plus.textContent = "+";
    plus.addEventListener("click", () => { changeLineQty(lineId, 1); if (afterChange) afterChange(); });
    box.append(minus, num, plus);
    return box;
  }

  function cartTotal() {
    let t = 0;
    cart.forEach((it) => { t += it.unitPrice * it.qty; });
    return t;
  }

  // Barra flotante (mobile): cantidad de ítems + total, o se oculta si está vacío.
  function updateFab() {
    if (!cartFab) return;
    let qty = 0;
    cart.forEach((it) => { qty += it.qty; });
    if (qty === 0) {
      show(cartFab, false);
      if (orderCartEl) orderCartEl.classList.remove("is-open"); // carrito vacío: cerrar el sheet
      show(cartOverlay, false);
      document.body.style.overflow = "";
      return;
    }
    if (cartFabCount) cartFabCount.textContent = String(qty);
    if (cartFabTotal) cartFabTotal.textContent = money(cartTotal());
    show(cartFab, true);
  }

  // Bottom sheet (mobile): el carrito sube desde abajo en vez de scrollear.
  function openCartSheet() {
    if (!orderCartEl) return;
    orderCartEl.classList.add("is-open");
    show(cartOverlay, true);
    show(cartFab, false);
    document.body.style.overflow = "hidden";
  }

  function closeCartSheet() {
    if (!orderCartEl) return;
    orderCartEl.classList.remove("is-open");
    show(cartOverlay, false);
    document.body.style.overflow = "";
    updateFab();
  }

  function renderCart() {
    cartItemsEl.textContent = "";
    if (cart.size === 0) {
      cartItemsEl.append(cartEmptyEl);
      show(cartEmptyEl, true);
      cartTotalEl.textContent = money(0);
      show(pointsHint, false);
      show(checkoutForm, false);
      updateFab();
      return;
    }
    show(cartEmptyEl, false);

    cart.forEach((it) => {
      const line = document.createElement("div");
      line.className = "cart-line";
      const info = document.createElement("div");
      info.className = "cl-info";
      const nm = document.createElement("div");
      nm.className = "cl-name";
      nm.textContent = it.name;
      info.append(nm);
      if (it.optionsText) {
        const op = document.createElement("div");
        op.className = "cl-options";
        op.textContent = it.optionsText;
        info.append(op);
      }
      if (it.note) {
        const nt = document.createElement("div");
        nt.className = "cl-note";
        nt.textContent = "📝 " + it.note;
        info.append(nt);
      }
      const pr = document.createElement("div");
      pr.className = "cl-price";
      pr.textContent = money(it.unitPrice) + " × " + it.qty + " = " + money(it.unitPrice * it.qty);
      info.append(pr);
      // Las burgers (con opciones) se pueden editar: reabre el popup con lo elegido.
      if (it.isOption) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "cl-edit";
        edit.textContent = "✏️ Editar";
        edit.addEventListener("click", () => editLineOptions(it));
        info.append(edit);
      }
      line.append(info, qtyControls(it.lineId));
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
    updateFab();
  }

  /* =========================================================
     Popup de opciones (papas / bebida / adicionales)
  ========================================================= */

  let modalEl = null;

  // Calcula el precio extra y el texto legible de una selección (para mostrar).
  function priceAndText(groups, selection) {
    let delta = 0;
    const parts = [];
    groups.forEach((g) => {
      const byId = {};
      g.options.forEach((o) => { byId[o.id] = o; });
      if (g.type === "single") {
        const id = selection[g.id];
        if (id && byId[id]) { delta += byId[id].price; parts.push(byId[id].name); }
      } else {
        const ids = selection[g.id] || [];
        const names = [];
        ids.forEach((id) => { if (byId[id]) { delta += byId[id].price; names.push(byId[id].name); } });
        if (names.length) parts.push(names.join(", "));
      }
    });
    return { delta, text: parts.join(" · ") };
  }

  function openOptionsModal(p, editLine) {
    const groups = optionSets[p.optionSet];
    if (!groups) { addSimple(p); return; }

    // Estado de la selección. Si estamos EDITANDO una línea, arranca con lo ya
    // elegido; si no, los "single" obligatorios arrancan en la 1ra opción.
    const prev = editLine && editLine.optionsPayload ? editLine.optionsPayload : null;
    const selection = {};
    groups.forEach((g) => {
      if (g.type === "single") {
        if (prev && prev[g.id] !== undefined) {
          selection[g.id] = prev[g.id];
        } else {
          selection[g.id] = g.required && g.options.length ? g.options[0].id : "";
        }
      } else {
        selection[g.id] = prev && Array.isArray(prev[g.id]) ? prev[g.id].slice() : [];
      }
    });

    const overlay = document.createElement("div");
    overlay.className = "opt-overlay";
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

    const modal = document.createElement("div");
    modal.className = "opt-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "opt-head";
    head.innerHTML = '<b>' + escapeHtml(p.name) + '</b>';
    const closeX = document.createElement("button");
    closeX.type = "button";
    closeX.className = "opt-close";
    closeX.setAttribute("aria-label", "Cerrar");
    closeX.textContent = "✕";
    closeX.addEventListener("click", closeModal);
    head.append(closeX);

    const groupsWrap = document.createElement("div");
    groupsWrap.className = "opt-groups";

    const footTotal = document.createElement("strong");
    footTotal.className = "opt-total-value";

    function recompute() {
      const pt = priceAndText(groups, selection);
      footTotal.textContent = money(p.price + pt.delta);
    }

    groups.forEach((g) => {
      const gEl = document.createElement("div");
      gEl.className = "opt-group";
      const gt = document.createElement("div");
      gt.className = "opt-group-title";
      gt.innerHTML = '<span>' + escapeHtml(g.title) + '</span>' +
        (g.required ? '<em class="opt-req">Obligatorio</em>' : '<em class="opt-opt">Opcional</em>');
      gEl.append(gt);

      if (g.type === "single") {
        // Para los opcionales agregamos "No, gracias".
        if (!g.required) {
          gEl.append(optionRow(g, { id: "", name: "No, gracias", price: 0 }, selection, recompute, "radio"));
        }
        g.options.forEach((o) => gEl.append(optionRow(g, o, selection, recompute, "radio")));
      } else {
        g.options.forEach((o) => gEl.append(optionRow(g, o, selection, recompute, "check")));
      }
      groupsWrap.append(gEl);
    });

    // Nota libre por producto (aclaraciones tipo "sin cebolla", "sin tomate").
    let noteText = editLine && editLine.note ? editLine.note : "";
    const noteGroup = document.createElement("div");
    noteGroup.className = "opt-group opt-note-group";
    const noteTitle = document.createElement("div");
    noteTitle.className = "opt-group-title";
    noteTitle.innerHTML = '<span>¿Alguna aclaración?</span><em class="opt-opt">Opcional</em>';
    const noteInput = document.createElement("textarea");
    noteInput.className = "opt-note-input";
    noteInput.rows = 2;
    noteInput.maxLength = 200;
    noteInput.placeholder = "Ej: sin cebolla, sin tomate…";
    noteInput.value = noteText;
    noteInput.addEventListener("input", () => { noteText = noteInput.value; });
    noteGroup.append(noteTitle, noteInput);
    groupsWrap.append(noteGroup);

    const foot = document.createElement("div");
    foot.className = "opt-foot";
    const totalWrap = document.createElement("div");
    totalWrap.className = "opt-total";
    totalWrap.innerHTML = '<span>Precio</span>';
    totalWrap.append(footTotal);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "opt-add-btn";
    addBtn.textContent = editLine ? "Guardar cambios" : "Agregar al pedido";
    addBtn.addEventListener("click", () => {
      if (editLine) {
        updateLineOptions(editLine, p, groups, selection, noteText);
      } else {
        addWithOptions(p, groups, selection, noteText);
      }
      closeModal();
    });
    foot.append(totalWrap, addBtn);

    modal.append(head, groupsWrap, foot);
    overlay.append(modal);
    document.body.append(overlay);
    document.body.style.overflow = "hidden";
    modalEl = overlay;
    recompute();
  }

  function optionRow(group, opt, selection, recompute, kind) {
    const row = document.createElement("label");
    row.className = "opt-row";
    const input = document.createElement("input");
    input.type = kind === "check" ? "checkbox" : "radio";
    input.name = "optg-" + group.id;
    input.value = opt.id;

    if (kind === "radio") {
      input.checked = selection[group.id] === opt.id;
      input.addEventListener("change", () => { selection[group.id] = opt.id; recompute(); });
    } else {
      input.checked = (selection[group.id] || []).indexOf(opt.id) !== -1;
      input.addEventListener("change", () => {
        const arr = selection[group.id] || [];
        if (input.checked) { if (arr.indexOf(opt.id) === -1) arr.push(opt.id); }
        else { const i = arr.indexOf(opt.id); if (i !== -1) arr.splice(i, 1); }
        selection[group.id] = arr;
        recompute();
      });
    }

    const label = document.createElement("span");
    label.className = "opt-row-name";
    label.textContent = opt.name;
    const price = document.createElement("span");
    price.className = "opt-row-price";
    price.textContent = opt.price > 0 ? "+ " + money(opt.price) : "";

    row.append(input, label, price);
    return row;
  }

  function addWithOptions(p, groups, selection, note) {
    const pt = priceAndText(groups, selection);
    // payload limpio para el server (sin las claves vacías de single opcional).
    const payload = {};
    groups.forEach((g) => {
      const v = selection[g.id];
      if (g.type === "single") { if (v) payload[g.id] = v; }
      else if (Array.isArray(v) && v.length) { payload[g.id] = v.slice(); }
    });

    // La aclaración forma parte de la identidad de la línea: dos burgers iguales
    // con notas distintas son líneas separadas.
    const noteClean = (note || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const lineId = "o:" + p.slug + ":" + signature(payload) + (noteClean ? "|n:" + noteClean : "");
    const existing = cart.get(lineId);
    if (existing) {
      existing.qty = Math.min(existing.qty + 1, 50);
    } else {
      cart.set(lineId, {
        lineId, slug: p.slug, name: p.name, unitPrice: p.price + pt.delta,
        qty: 1, optionsText: pt.text, optionsPayload: payload, note: noteClean, isOption: true,
      });
    }
    renderCart();
  }

  // Guarda los cambios de opciones/nota EN la misma línea (editar en vez de sumar
  // una nueva). Si la nueva combinación coincide con otra línea, las une.
  function updateLineOptions(line, p, groups, selection, note) {
    const pt = priceAndText(groups, selection);
    const payload = {};
    groups.forEach((g) => {
      const v = selection[g.id];
      if (g.type === "single") { if (v) payload[g.id] = v; }
      else if (Array.isArray(v) && v.length) { payload[g.id] = v.slice(); }
    });
    const noteClean = (note || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const newLineId = "o:" + p.slug + ":" + signature(payload) + (noteClean ? "|n:" + noteClean : "");
    const qty = line.qty;

    cart.delete(line.lineId);
    const existing = cart.get(newLineId);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, 50);
    } else {
      cart.set(newLineId, {
        lineId: newLineId, slug: p.slug, name: p.name, unitPrice: p.price + pt.delta,
        qty: Math.min(qty, 50), optionsText: pt.text, optionsPayload: payload, note: noteClean, isOption: true,
      });
    }
    renderCart();
  }

  // Reabre el popup con lo ya elegido, para editar una línea del carrito.
  function editLineOptions(line) {
    const p = productBySlug.get(line.slug);
    if (!p) return;
    openOptionsModal(p, line);
  }

  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalEl) closeModal(); });

  /* =========================================================
     Cupones / cuenta / entrega
  ========================================================= */

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

  /* Gate de admin (mientras los pedidos están en revisión). La página arranca
     oculta (<main hidden>). Solo la mostramos si sos admin; un socio que llegue
     por la URL es redirigido. También precarga el WhatsApp de la cuenta.
     Para publicar: quitar este gate y el `hidden` del <main> en pedir.html. */
  async function ensureAllowed() {
    const mainEl = document.querySelector("[data-order-main]");
    try {
      const res = await fetch("/api/me.php", { credentials: "same-origin" });
      const data = await res.json();
      const u = data.user;
      if (!u) { window.location.replace("ingresar.html?next=/pedir.html"); return false; }
      if (!u.isAdmin) { window.location.replace("index.html"); return false; }
      if (u.whatsapp && !phoneInput.value) phoneInput.value = u.whatsapp;
      if (u.name && !pickupInput.value) pickupInput.value = u.name;
      if (mainEl) mainEl.hidden = false;
      return true;
    } catch (e) {
      window.location.replace("index.html");
      return false;
    }
  }

  function applyFulfillment(kind) {
    const isDelivery = kind === "delivery";
    show(addressField, isDelivery);
    show(pickupField, !isDelivery);
  }

  function initFulfillment() {
    const opts = document.querySelectorAll("[data-fulfill-opt]");
    opts.forEach((opt) => {
      const input = opt.querySelector("input");
      input.addEventListener("change", () => {
        opts.forEach((o) => o.classList.toggle("is-active", o === opt));
        applyFulfillment(opt.getAttribute("data-fulfill-opt"));
      });
    });
    applyFulfillment(currentFulfillment()); // estado inicial (por defecto: retiro)
  }

  function currentFulfillment() {
    const checked = document.querySelector('input[name="fulfillment"]:checked');
    return checked ? checked.value : "pickup";
  }

  /* =========================================================
     Enviar pedido
  ========================================================= */

  async function submitOrder(ev) {
    ev.preventDefault();
    setStatus("");

    if (cart.size === 0) { setStatus("Tu pedido está vacío.", "error"); return; }
    const fulfillment = currentFulfillment();
    const address = addressInput.value.trim();
    if (fulfillment === "delivery" && !address) {
      setStatus("Para delivery necesitamos tu dirección.", "error");
      addressInput.focus();
      return;
    }

    const items = [];
    cart.forEach((it) => { items.push({ slug: it.slug, qty: it.qty, options: it.optionsPayload || {}, note: it.note || "" }); });

    const payload = {
      items,
      fulfillment,
      address: fulfillment === "delivery" ? address : "",
      pickupName: fulfillment === "pickup" ? pickupInput.value.trim() : "",
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
        a.textContent = ln.qty + "× " + ln.name + (ln.options ? " (" + ln.options + ")" : "");
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

    if (orderCartEl) orderCartEl.classList.remove("is-open");
    show(cartOverlay, false);
    document.body.style.overflow = "";
    show(layoutEl, false);
    show(heroEl, false);
    show(cartFab, false);
    show(successEl, true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    pollOrderStatus(order.id);
  }

  // Estado del pedido en vivo en la pantalla de éxito (se actualiza solo).
  const SUCCESS_STAGES = {
    pending:    "🟡 Recibido",
    confirmed:  "✅ Aceptado",
    preparing:  "👨‍🍳 En preparación",
    on_the_way: "🛵 En camino",
    delivered:  "🎉 ¡Entregado!",
    cancelled:  "❌ Cancelado",
  };
  let statusPollTimer = null;

  function pollOrderStatus(orderId) {
    const stEl = $("[data-success-state]");
    if (!stEl) return;
    clearInterval(statusPollTimer);
    stEl.textContent = SUCCESS_STAGES.pending;
    async function tick() {
      try {
        const res = await fetch("/api/orders/mine.php", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const o = (data.orders || []).find((x) => x.id === orderId);
        if (!o) return;
        stEl.textContent = SUCCESS_STAGES[o.status] || o.status;
        if (o.status === "delivered" || o.status === "cancelled") clearInterval(statusPollTimer);
      } catch (e) { /* reintenta en el próximo tick */ }
    }
    tick();
    statusPollTimer = setInterval(tick, 20000);
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function resetForNewOrder() {
    clearInterval(statusPollTimer);
    cart.clear();
    couponSelect.value = "";
    notesInput.value = "";
    addressInput.value = "";
    show(successEl, false);
    show(layoutEl, true);
    show(heroEl, true);
    renderCart();
    // Los steppers de productos simples vuelven a "Agregar +".
    menuList.querySelectorAll("[data-stepper-for]").forEach((holder) => {
      if (holder.__product) refreshSimpleStepper(holder.__product.slug);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* =========================================================
     Carga inicial
  ========================================================= */

  async function loadMenu() {
    try {
      const res = await fetch("/api/menu.php", { credentials: "same-origin" });
      if (res.status === 401) return; // el guard ya redirige
      const data = await res.json();
      pointsPerAmount = Number(data.pointsPerAmount) || 100;
      optionSets = data.optionSets || {};
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
    const allowed = await ensureAllowed();
    if (!allowed) return;

    initFulfillment();
    loadMenu();
    loadCoupons();
    renderCart();
    checkoutForm.addEventListener("submit", submitOrder);
    if (cartFab) cartFab.addEventListener("click", openCartSheet);
    if (cartOverlay) cartOverlay.addEventListener("click", closeCartSheet);
    if (cartCloseBtn) cartCloseBtn.addEventListener("click", closeCartSheet);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && orderCartEl && orderCartEl.classList.contains("is-open")) closeCartSheet();
    });
    const newOrderBtn = $("[data-new-order]");
    if (newOrderBtn) newOrderBtn.addEventListener("click", resetForNewOrder);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
