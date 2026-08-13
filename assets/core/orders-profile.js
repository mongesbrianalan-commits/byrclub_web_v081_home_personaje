(() => {
  "use strict";

  /* =========================================================
     BYR Club — "Mis pedidos" (perfil)
     ---------------------------------------------------------
     Trae los pedidos del socio de /api/orders/mine.php y los
     muestra con su estado (Pendiente / Confirmado / Cancelado),
     los ítems, el total y los puntos que se acreditaron.
  ========================================================= */

  const section = document.querySelector("[data-orders-section]");
  if (!section) return;

  const listEl  = section.querySelector("[data-orders-list]");
  const emptyEl = section.querySelector("[data-orders-empty]");
  const errorEl = section.querySelector("[data-orders-error]");

  const STATUS = {
    pending:   { label: "Pendiente",  cls: "pending" },
    confirmed: { label: "Confirmado", cls: "confirmed" },
    cancelled: { label: "Cancelado",  cls: "cancelled" },
  };

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-AR"); }
  function show(el, v) { if (el) el.hidden = !v; }

  function fmtDate(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm;
  }

  function orderCard(o) {
    const st = STATUS[o.status] || STATUS.pending;
    const card = document.createElement("article");
    card.className = "order-card is-" + o.status;

    // Encabezado: id + fecha + estado
    const top = document.createElement("div");
    top.className = "order-card-top";
    const id = document.createElement("div");
    id.className = "order-card-id";
    id.innerHTML = "Pedido #" + o.id + "<small>" + fmtDate(o.createdAt) + "</small>";
    const badge = document.createElement("span");
    badge.className = "order-badge " + st.cls;
    badge.textContent = st.label;
    top.append(id, badge);

    // Ítems
    const items = document.createElement("ul");
    items.className = "order-card-items";
    (o.items || []).forEach((ln) => {
      const li = document.createElement("li");
      const a = document.createElement("span");
      a.textContent = ln.qty + "× " + ln.name;
      const b = document.createElement("span");
      b.textContent = money(ln.subtotal);
      li.append(a, b);
      items.append(li);
    });

    // Meta: entrega + cupón
    const meta = document.createElement("div");
    meta.className = "order-card-meta";
    const fulfil = document.createElement("span");
    fulfil.textContent = o.fulfillment === "delivery" ? "🛵 Delivery" : "🏪 Retiro";
    meta.append(fulfil);
    if (o.couponLabel) {
      const cp = document.createElement("span");
      cp.className = "om-coupon";
      cp.textContent = "🎟️ " + o.couponLabel;
      meta.append(cp);
    }

    // Pie: total + puntos
    const foot = document.createElement("div");
    foot.className = "order-card-foot";
    const total = document.createElement("span");
    total.className = "order-card-total";
    total.textContent = money(o.itemsTotal);
    const pts = document.createElement("span");
    if (o.status === "confirmed") {
      pts.className = "order-card-points earned";
      pts.textContent = "🪙 +" + Number(o.pointsAwarded || 0).toLocaleString("es-AR") + " pts";
    } else if (o.status === "cancelled") {
      pts.className = "order-card-points";
      pts.textContent = "";
    } else {
      pts.className = "order-card-points pending";
      pts.textContent = "🪙 ~" + Number(o.pointsSuggested || 0).toLocaleString("es-AR") + " pts al confirmar";
    }
    foot.append(total, pts);

    card.append(top, items, meta, foot);
    return card;
  }

  function render(orders) {
    listEl.textContent = "";
    show(errorEl, false);
    if (!orders.length) {
      show(listEl, false);
      show(emptyEl, true);
      return;
    }
    show(emptyEl, false);
    show(listEl, true);
    const frag = document.createDocumentFragment();
    orders.forEach((o) => frag.append(orderCard(o)));
    listEl.append(frag);
  }

  async function load() {
    let data;
    try {
      const res = await fetch("/api/orders/mine.php", { credentials: "same-origin" });
      if (res.status === 401) { section.hidden = true; return; }
      data = await res.json();
    } catch (e) {
      show(listEl, false);
      show(emptyEl, false);
      show(errorEl, true);
      return;
    }
    render(Array.isArray(data.orders) ? data.orders : []);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }

  // Si el estado del usuario cambia (sync), reconsultamos por si confirmaron un pedido.
  window.addEventListener("byr:user-updated", load);
})();
