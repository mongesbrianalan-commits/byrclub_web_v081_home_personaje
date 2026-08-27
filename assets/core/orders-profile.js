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
    pending:    { label: "Recibido",       cls: "pending" },
    confirmed:  { label: "Aceptado",       cls: "confirmed" },
    preparing:  { label: "En preparación", cls: "preparing" },
    on_the_way: { label: "En camino",      cls: "onway" },
    delivered:  { label: "Entregado",      cls: "delivered" },
    cancelled:  { label: "Cancelado",      cls: "cancelled" },
  };

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-AR"); }
  function show(el, v) { if (el) el.hidden = !v; }

  /* Fecha para mostrar. Si el servidor mandó la etiqueta ya hecha se usa esa
     (viene en hora de Argentina). El respaldo lee el valor de la base como
     UTC, que es como está guardado: sin la "Z", el navegador lo tomaba como
     hora local y cerca de medianoche mostraba el día siguiente. */
  function fmtDate(value, label) {
    if (label) return label;
    if (!value) return "";
    // Sin la "Z" el navegador lo tomaba como hora local, pero la base guarda
    // en UTC: cerca de medianoche mostraba el día siguiente.
    const d = new Date(String(value).replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return "";
    // A mano y no con toLocaleDateString: es-AR ignora el "2-digit" del mes.
    const p = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit",
    }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return p.day + "/" + p.month;
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
    id.innerHTML = "Pedido #" + o.id + "<small>" + fmtDate(o.createdAt, o.createdAtLabel) + "</small>";
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
      a.textContent = ln.qty + "× " + ln.name + (ln.options ? " (" + ln.options + ")" : "");
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
    // Lo que pagó: comida + envío (los pedidos viejos no tienen envío).
    total.textContent = money(o.total != null ? o.total : o.itemsTotal);
    if (o.shippingCost > 0) {
      total.title = "Incluye " + money(o.shippingCost) + " de envío";
    }
    const pts = document.createElement("span");
    if (o.pointsAwarded !== null && o.status !== "cancelled") {
      pts.className = "order-card-points earned";
      pts.textContent = "🪙 +" + Number(o.pointsAwarded || 0).toLocaleString("es-AR") + " pts";
    } else if (o.status === "cancelled") {
      pts.className = "order-card-points";
      pts.textContent = "";
    } else {
      pts.className = "order-card-points pending";
      pts.textContent = "🪙 ~" + Number(o.pointsSuggested || 0).toLocaleString("es-AR") + " pts al aceptar";
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
    settleHash();
  }

  /* Si se llegó con #mis-pedidos (desde el panel de "pedido enviado"), hay que
     volver a acomodar el scroll DESPUÉS de dibujar.

     El navegador salta al ancla apenas carga el HTML, pero arriba de esta
     sección están los cupones, que también se traen por fetch. Cuando esa
     lista aparece, empuja todo para abajo y el socio queda parado en cupones
     en vez de en sus pedidos. Por eso se reposiciona acá, cuando el contenido
     ya está puesto, y una vez más un toque después por si los cupones
     terminaron de cargar recién. */
  let hashSettled = false;

  function settleHash() {
    if (hashSettled || window.location.hash !== "#" + section.id) return;
    hashSettled = true;

    const ir = () => section.scrollIntoView({ behavior: "smooth", block: "start" });
    ir();
    window.setTimeout(ir, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }

  // Si el estado del usuario cambia (sync), reconsultamos por si confirmaron un pedido.
  window.addEventListener("byr:user-updated", load);
})();
