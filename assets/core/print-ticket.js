(() => {
  "use strict";

  /* =========================================================
     BYR Club — Impresión de comanda y ticket (80mm)
     ---------------------------------------------------------
     Genera una hoja imprimible de 80mm y la manda a imprimir desde el navegador
     (sirve con cualquier impresora instalada en la PC: térmica o común; para
     probar sin impresora: "Imprimir → Guardar como PDF"). No depende del modelo.

     Uso:  window.BYRPrint.comanda(order)   // cocina (sin precios)
           window.BYRPrint.ticket(order)    // cliente (con precios y total)

     order: { id, createdAt?, fulfillment?, customerName?, customerPhone?,
              address?, notes?, itemsTotal, paymentMethod?,
              items: [{ qty, name, options?, subtotal }] }
  ========================================================= */

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-AR"); }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  function fmtDateTime(value) {
    const d = value ? new Date(String(value).replace(" ", "T")) : new Date();
    const dt = isNaN(d.getTime()) ? new Date() : d;
    const p = (n) => String(n).padStart(2, "0");
    return p(dt.getDate()) + "/" + p(dt.getMonth() + 1) + " " + p(dt.getHours()) + ":" + p(dt.getMinutes());
  }

  const CSS = `
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; }
    body { padding: 4mm 3mm 8mm; color: #000; background: #fff;
      font-family: "Cascadia Mono", "Consolas", ui-monospace, monospace; font-size: 12px; line-height: 1.35; }
    .c { text-align: center; }
    .b { font-weight: 700; }
    .big { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
    .mid { font-size: 14px; font-weight: 700; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 4px 0; }
    .kline { font-size: 15px; font-weight: 700; }
    .opt { font-size: 11px; padding-left: 8px; }
    .note { font-size: 12px; font-weight: 700; }
    .tot { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .small { font-size: 11px; }
  `;

  function fulfillLabel(o) {
    return o.fulfillment === "delivery" ? "DELIVERY" : (o.fulfillment === "mostrador" ? "MOSTRADOR" : "RETIRO");
  }

  const METHODS = { efectivo: "Efectivo", debito: "Débito", credito: "Crédito", qr: "QR", transfer: "Transferencia" };

  /* --- Comanda de cocina: grande, legible, SIN precios --- */
  function comandaHTML(o) {
    const items = (o.items || []).map((ln) =>
      '<div class="item"><div class="kline">' + esc(ln.qty) + "x " + esc(ln.name) + "</div>" +
      (ln.options ? '<div class="opt">' + esc(ln.options) + "</div>" : "") +
      "</div>"
    ).join("");

    return doc(
      '<div class="c big">COMANDA</div>' +
      '<div class="c mid">Pedido #' + esc(o.id) + "</div>" +
      '<div class="c small">' + esc(fmtDateTime(o.createdAt)) + "</div>" +
      "<hr>" +
      '<div class="b">' + fulfillLabel(o) + "</div>" +
      (o.customerName ? "<div>" + esc(o.customerName) + "</div>" : "") +
      (o.fulfillment === "delivery" && o.address ? '<div class="small">' + esc(o.address) + "</div>" : "") +
      "<hr>" + items +
      (o.notes ? '<hr><div class="note">NOTA: ' + esc(o.notes) + "</div>" : "")
    );
  }

  /* --- Ticket del cliente: con precios y total (no fiscal) --- */
  function ticketHTML(o) {
    const items = (o.items || []).map((ln) =>
      '<div class="item"><div class="row"><span>' + esc(ln.qty) + "x " + esc(ln.name) + "</span>" +
      "<span>" + money(ln.subtotal) + "</span></div>" +
      (ln.options ? '<div class="opt">' + esc(ln.options) + "</div>" : "") +
      "</div>"
    ).join("");

    const shipping = Number(o.shippingCost || 0);
    const shipRows = shipping > 0
      ? '<div class="row"><span>Subtotal</span><span>' + money(o.itemsTotal) + "</span></div>" +
        '<div class="row"><span>Envío</span><span>' + money(shipping) + "</span></div>"
      : "";

    return doc(
      '<div class="c big">BYR DOCKSUD</div>' +
      '<div class="c small">Comprobante no fiscal</div>' +
      "<hr>" +
      '<div class="row"><span>Pedido #' + esc(o.id) + "</span><span>" + esc(fmtDateTime(o.createdAt)) + "</span></div>" +
      "<div>" + fulfillLabel(o) + (o.customerName ? " · " + esc(o.customerName) : "") + "</div>" +
      "<hr>" + items + "<hr>" + shipRows +
      '<div class="row tot"><span>TOTAL</span><span>' + money(Number(o.itemsTotal || 0) + shipping) + "</span></div>" +
      (o.paymentMethod ? '<div class="small">Pago: ' + esc(METHODS[o.paymentMethod] || o.paymentMethod) + "</div>" : "") +
      '<hr><div class="c">¡Gracias por tu compra!</div>' +
      '<div class="c small">BYR Club · Dock Sud</div>'
    );
  }

  function doc(inner) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>Impresión</title>' +
      "<style>" + CSS + "</style></head><body>" + inner + "</body></html>";
  }

  /* Imprime un HTML en un iframe oculto (no lo bloquean los popups). */
  function printHTML(html) {
    const ifr = document.createElement("iframe");
    ifr.setAttribute("aria-hidden", "true");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(ifr);
    const d = ifr.contentWindow.document;
    d.open();
    d.write(html);
    d.close();
    setTimeout(() => {
      try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (e) { /* noop */ }
      setTimeout(() => { ifr.remove(); }, 2000);
    }, 300);
  }

  window.BYRPrint = {
    comanda: (o) => printHTML(comandaHTML(o)),
    ticket: (o) => printHTML(ticketHTML(o)),
  };
})();
