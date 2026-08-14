(() => {
  "use strict";

  /* =========================================================
     BYR Club — Venta de mostrador (mostrador.html)
     ---------------------------------------------------------
     POS para el cajero: arma el pedido desde el menú real, elige medio de pago
     y lo COBRA en el acto (crea la venta ya confirmada y pagada). Si identifica
     al socio por email/WhatsApp, le acredita los puntos. Los precios los
     recalcula SIEMPRE el servidor (acá solo mandamos slug + cantidad + opciones).
     Página admin-only: arranca oculta y se muestra solo si sos admin.
  ========================================================= */

  const $ = (sel, root = document) => root.querySelector(sel);

  const menuList     = $("[data-menu-list]");
  const menuLoading  = $("[data-menu-loading]");
  const menuError    = $("[data-menu-error]");
  const cartItemsEl  = $("[data-cart-items]");
  const cartEmptyEl  = $("[data-cart-empty]");
  const cartTotalEl  = $("[data-cart-total]");
  const checkoutEl   = $("[data-checkout]");
  const customerInput= $("[data-customer-input]");
  const customerFind = $("[data-customer-find]");
  const customerStatus = $("[data-customer-status]");
  const payMethodSel = $("[data-pay-method]");
  const tenderedField= $("[data-tendered-field]");
  const tenderedInput= $("[data-tendered]");
  const changeRow    = $("[data-change-row]");
  const changeEl     = $("[data-change]");
  const chargeBtn    = $("[data-charge-btn]");
  const statusEl     = $("[data-pos-status]");
  const successEl    = $("[data-sale-success]");
  const layoutEl     = $(".order-layout");
  const heroEl       = $(".order-hero");
  const cajaWarning  = $("[data-caja-warning]");

  if (!menuList) return;

  const cart = new Map();
  const productBySlug = new Map();
  let optionSets = {};
  let customerEmail = "";   // socio resuelto (vacío = consumidor final)
  let cajaOpen = false;

  /* --- Utilidades --- */
  function money(n) { return "$" + Number(n || 0).toLocaleString("es-AR"); }
  function show(el, visible) { if (el) el.hidden = !visible; }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }
  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

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
    price.textContent = (hasOptions(p) ? "desde " : "") + money(p.price);
    foot.append(price, actionFor(p));
    body.append(name, desc, foot);
    card.append(body);
    return card;
  }

  function actionFor(p) {
    if (hasOptions(p)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-add";
      btn.textContent = "Agregar +";
      btn.addEventListener("click", () => openOptionsModal(p));
      return btn;
    }
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
    holder.replaceWith(actionFor(holder.__product));
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
      cat.products.forEach((p) => { productBySlug.set(p.slug, p); grid.append(productCard(p)); });
      section.append(h2, grid);
      menuList.append(section);
    });
  }

  /* =========================================================
     Carrito
  ========================================================= */

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
        qty: 1, optionsText: "", optionsPayload: {}, note: "", isOption: false,
      });
    }
    refreshSimpleStepper(p.slug);
    renderCart();
  }

  function changeLineQty(lineId, delta) {
    const line = cart.get(lineId);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) cart.delete(lineId);
    else line.qty = Math.min(line.qty, 50);
    if (!line.isOption) refreshSimpleStepper(line.slug);
    renderCart();
  }

  function qtyControls(lineId, afterChange) {
    const line = cart.get(lineId);
    const qty = line ? line.qty : 0;
    const box = document.createElement("div");
    box.className = "qty-stepper";
    const minus = document.createElement("button");
    minus.type = "button"; minus.className = "qty-btn"; minus.setAttribute("aria-label", "Quitar uno"); minus.textContent = "−";
    minus.addEventListener("click", () => { changeLineQty(lineId, -1); if (afterChange) afterChange(); });
    const num = document.createElement("span");
    num.className = "qty-num"; num.textContent = String(qty);
    const plus = document.createElement("button");
    plus.type = "button"; plus.className = "qty-btn"; plus.setAttribute("aria-label", "Agregar uno"); plus.textContent = "+";
    plus.addEventListener("click", () => { changeLineQty(lineId, 1); if (afterChange) afterChange(); });
    box.append(minus, num, plus);
    return box;
  }

  function cartTotal() {
    let t = 0;
    cart.forEach((it) => { t += it.unitPrice * it.qty; });
    return t;
  }

  function renderCart() {
    cartItemsEl.textContent = "";
    if (cart.size === 0) {
      cartItemsEl.append(cartEmptyEl);
      show(cartEmptyEl, true);
      cartTotalEl.textContent = money(0);
      show(checkoutEl, false);
      recomputeChange();
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

    cartTotalEl.textContent = money(cartTotal());
    show(checkoutEl, true);
    recomputeChange();
  }

  /* =========================================================
     Popup de opciones (papas / bebida / adicionales + nota)
  ========================================================= */

  let modalEl = null;

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

    // Si editamos una línea, arranca con lo ya elegido.
    const prev = editLine && editLine.optionsPayload ? editLine.optionsPayload : null;
    const selection = {};
    groups.forEach((g) => {
      if (g.type === "single") {
        selection[g.id] = (prev && prev[g.id] !== undefined)
          ? prev[g.id]
          : (g.required && g.options.length ? g.options[0].id : "");
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
    head.innerHTML = "<b>" + escapeHtml(p.name) + "</b>";
    const closeX = document.createElement("button");
    closeX.type = "button"; closeX.className = "opt-close"; closeX.setAttribute("aria-label", "Cerrar"); closeX.textContent = "✕";
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
      gt.innerHTML = "<span>" + escapeHtml(g.title) + "</span>" +
        (g.required ? '<em class="opt-req">Obligatorio</em>' : '<em class="opt-opt">Opcional</em>');
      gEl.append(gt);
      if (g.type === "single") {
        if (!g.required) gEl.append(optionRow(g, { id: "", name: "No, gracias", price: 0 }, selection, recompute, "radio"));
        g.options.forEach((o) => gEl.append(optionRow(g, o, selection, recompute, "radio")));
      } else {
        g.options.forEach((o) => gEl.append(optionRow(g, o, selection, recompute, "check")));
      }
      groupsWrap.append(gEl);
    });

    // Aclaración libre (ej: "sin cebolla").
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
    totalWrap.innerHTML = "<span>Precio</span>";
    totalWrap.append(footTotal);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "opt-add-btn";
    addBtn.textContent = editLine ? "Guardar cambios" : "Agregar al pedido";
    addBtn.addEventListener("click", () => {
      if (editLine) updateLineOptions(editLine, p, groups, selection, noteText);
      else addWithOptions(p, groups, selection, noteText);
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
    const payload = {};
    groups.forEach((g) => {
      const v = selection[g.id];
      if (g.type === "single") { if (v) payload[g.id] = v; }
      else if (Array.isArray(v) && v.length) payload[g.id] = v.slice();
    });
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

  // Editar una línea: actualiza la MISMA línea (respeta qty, une si coincide).
  function updateLineOptions(line, p, groups, selection, note) {
    const pt = priceAndText(groups, selection);
    const payload = {};
    groups.forEach((g) => {
      const v = selection[g.id];
      if (g.type === "single") { if (v) payload[g.id] = v; }
      else if (Array.isArray(v) && v.length) payload[g.id] = v.slice();
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
     Cliente (socio) + vuelto
  ========================================================= */

  function setCustomerStatus(msg, kind) {
    customerStatus.textContent = msg || "";
    customerStatus.classList.remove("is-error", "is-ok");
    if (kind) customerStatus.classList.add(kind === "error" ? "is-error" : "is-ok");
  }

  async function findCustomer() {
    const q = customerInput.value.trim();
    if (q === "") { customerEmail = ""; setCustomerStatus("Consumidor final (sin puntos).", ""); return; }
    customerFind.disabled = true;
    setCustomerStatus("Buscando…", "");
    try {
      const res = await fetch("/api/admin/lookup.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) { customerEmail = ""; setCustomerStatus(data.error || "No se encontró el socio.", "error"); return; }
      if (data.matches) {
        customerEmail = "";
        setCustomerStatus("Hay varias cuentas con ese número. Escribí el email exacto.", "error");
        return;
      }
      const u = data.user;
      customerEmail = u.email || "";
      setCustomerStatus("✅ " + u.name + " · " + Number(u.points || 0).toLocaleString("es-AR") + " pts", "ok");
    } catch (e) {
      customerEmail = "";
      setCustomerStatus("No hay conexión. Probá de nuevo.", "error");
    } finally {
      customerFind.disabled = false;
    }
  }

  function recomputeChange() {
    const isCash = payMethodSel.value === "efectivo";
    show(tenderedField, isCash);
    if (!isCash) { show(changeRow, false); return; }
    const total = cartTotal();
    const tendered = parseInt(tenderedInput.value, 10);
    if (isNaN(tendered) || tendered < total) { show(changeRow, false); return; }
    changeEl.textContent = money(tendered - total);
    show(changeRow, true);
  }

  /* =========================================================
     Cobrar
  ========================================================= */

  async function charge() {
    setStatus("");
    if (cart.size === 0) { setStatus("La venta está vacía.", "error"); return; }
    if (!cajaOpen) { setStatus("Abrí la caja antes de vender (pestaña Caja del panel).", "error"); return; }

    const items = [];
    cart.forEach((it) => { items.push({ slug: it.slug, qty: it.qty, options: it.optionsPayload || {}, note: it.note || "" }); });

    const payMethod = payMethodSel.value;
    const tendered = payMethod === "efectivo" ? parseInt(tenderedInput.value, 10) : null;
    const payload = {
      items,
      paymentMethod: payMethod,
      tendered: isNaN(tendered) ? null : tendered,
      customerEmail,
    };

    chargeBtn.disabled = true;
    chargeBtn.textContent = "Cobrando…";
    try {
      const res = await fetch("/api/admin/pos-sale.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setStatus(data.error || "No se pudo cobrar. Probá de nuevo.", "error"); return; }
      showSuccess(data.sale, data.printed);
    } catch (e) {
      setStatus("No hay conexión. Probá de nuevo.", "error");
    } finally {
      chargeBtn.disabled = false;
      chargeBtn.textContent = "Cobrar 💵";
    }
  }

  const METHOD_LABELS = { efectivo: "Efectivo", debito: "Débito", credito: "Crédito", qr: "QR", transfer: "Transferencia" };

  function showSuccess(sale, printed) {
    const idEl = $("[data-success-id]");
    if (idEl) idEl.textContent = "#" + sale.id;
    const methodEl = $("[data-success-method]");
    if (methodEl) methodEl.textContent = METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod;

    const summary = $("[data-success-summary]");
    if (summary) {
      summary.textContent = "";
      (sale.items || []).forEach((ln) => {
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
      const ta = document.createElement("span"); ta.textContent = "Total";
      const tb = document.createElement("b"); tb.textContent = money(sale.itemsTotal);
      totalRow.append(ta, tb);
      summary.append(totalRow);
      if (sale.change !== null && sale.change !== undefined) {
        const cRow = document.createElement("div");
        cRow.className = "ss-line";
        cRow.innerHTML = "<span>Vuelto</span><span>" + money(sale.change) + "</span>";
        summary.append(cRow);
      }
      if (sale.pointsAwarded > 0) {
        const pRow = document.createElement("div");
        pRow.className = "ss-line";
        pRow.innerHTML = "<span>🪙 Puntos a " + escapeHtml(sale.customerName) + "</span><span>+" +
          Number(sale.pointsAwarded).toLocaleString("es-AR") + "</span>";
        summary.append(pRow);
      }
    }

    // Impresión. La comanda ya salió sola al cobrar (el server la encoló y el
    // agente del local la imprime); estos botones son para volver a sacarla o
    // para el ticket del cliente, que no se imprime en cada venta.
    const forPrint = Object.assign({ fulfillment: "mostrador" }, sale);
    const note = $("[data-print-note]");
    const auto = Array.isArray(printed) ? printed : [];
    if (note) {
      note.style.color = "#9bd1ff";
      note.textContent = auto.includes("comanda")
        ? "🖨️ La comanda ya salió en la cocina."
        : "";
    }

    const wirePrint = (el, kind, label) => {
      if (!el) return;
      const idle = "🖨️ " + label;
      el.textContent = idle;
      el.disabled = false;
      el.onclick = async () => {
        el.disabled = true;
        el.textContent = "Enviando…";
        try {
          const res = await fetch("/api/admin/print-job.php", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: sale.id, kind }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo imprimir.");
          el.textContent = "✅ " + label;
          if (note) { note.style.color = "#9bd1ff"; note.textContent = "Mandado a la impresora del local."; }
          setTimeout(() => { el.textContent = idle; el.disabled = false; }, 2500);
        } catch (e) {
          el.textContent = idle;
          el.disabled = false;
          // Respaldo: el diálogo de impresión del navegador.
          if (window.BYRPrint) {
            if (note) { note.style.color = "#9bd1ff"; note.textContent = "La impresora del local no está disponible. Abrimos el diálogo de impresión."; }
            window.BYRPrint[kind](forPrint);
          } else if (note) {
            note.style.color = "#ffb0b0";
            note.textContent = e.message;
          }
        }
      };
    };

    wirePrint($("[data-print-comanda]"), "comanda", "Comanda");
    wirePrint($("[data-print-ticket]"), "ticket", "Ticket");

    show(layoutEl, false);
    show(heroEl, false);
    show(cajaWarning, false);
    show(successEl, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForNewSale() {
    cart.clear();
    customerEmail = "";
    customerInput.value = "";
    setCustomerStatus("", "");
    tenderedInput.value = "";
    payMethodSel.value = "efectivo";
    show(successEl, false);
    show(layoutEl, true);
    show(heroEl, true);
    if (!cajaOpen) show(cajaWarning, true);
    renderCart();
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
      const res = await fetch("/api/menu.php?staff=1", { credentials: "same-origin" });
      if (res.status === 401) return;
      const data = await res.json();
      optionSets = data.optionSets || {};
      const cats = Array.isArray(data.categories) ? data.categories : [];
      show(menuLoading, false);
      if (!cats.length) {
        menuError.textContent = "El menú todavía no está cargado.";
        show(menuError, true);
        return;
      }
      renderMenu(cats);
    } catch (e) {
      show(menuLoading, false);
      show(menuError, true);
    }
  }

  async function checkCaja() {
    try {
      const res = await fetch("/api/admin/caja-status.php", { credentials: "same-origin" });
      const data = await res.json();
      if (data.ready === false) {
        cajaOpen = false;
        cajaWarning.innerHTML = "⚙️ Falta correr las migraciones de caja y mostrador en phpMyAdmin.";
        show(cajaWarning, true);
        return;
      }
      cajaOpen = !!data.open;
      if (!cajaOpen) {
        cajaWarning.innerHTML = '💵 La caja está cerrada. Abrila desde el <a href="admin.html">panel → Caja</a> para poder cobrar.';
        show(cajaWarning, true);
      } else {
        show(cajaWarning, false);
      }
    } catch (e) { /* si falla, el server igual valida al cobrar */ }
  }

  /* Gate de admin: la página arranca oculta. Solo la mostramos si sos admin. */
  async function ensureAdmin() {
    const mainEl = document.querySelector("[data-pos-main]");
    try {
      const res = await fetch("/api/me.php", { credentials: "same-origin" });
      const data = await res.json();
      const u = data.user;
      if (!u) { window.location.replace("ingresar.html?next=/mostrador.html"); return false; }
      const role = u.role || (u.isAdmin ? "admin" : "socio");
      if (role !== "admin" && role !== "cajero") { window.location.replace("index.html"); return false; }
      if (mainEl) mainEl.hidden = false;
      return true;
    } catch (e) {
      window.location.replace("index.html");
      return false;
    }
  }

  async function init() {
    const allowed = await ensureAdmin();
    if (!allowed) return;
    loadMenu();
    checkCaja();
    renderCart();
    customerFind.addEventListener("click", findCustomer);
    customerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findCustomer(); } });
    payMethodSel.addEventListener("change", recomputeChange);
    tenderedInput.addEventListener("input", recomputeChange);
    chargeBtn.addEventListener("click", charge);
    const newSaleBtn = $("[data-new-sale]");
    if (newSaleBtn) newSaleBtn.addEventListener("click", resetForNewSale);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
