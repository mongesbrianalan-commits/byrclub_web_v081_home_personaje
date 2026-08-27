<?php
/**
 * ADMIN — Las entregas de una JORNADA, para pagarle al delivery.
 *
 * Al cerrar hay que contar cuántos envíos hizo y multiplicarlos por lo que se
 * le paga por viaje. Hasta ahora el único número parecido era el de "Delivery
 * vs. retiro", que cuenta por día de calendario: partía el turno al medio y no
 * servía para pagar.
 *
 * Acá el corte es la jornada (ver byr_shift_bounds): de las 06:00 a las 06:00,
 * así un pedido de las 00:20 se le cuenta al turno en el que trabajó.
 *
 * Cuenta las entregas HECHAS, no las pedidas: los pedidos cancelados quedan
 * afuera, porque por un pedido cancelado nadie salió a la calle. Entran tanto
 * los pedidos web como los cargados en el mostrador para mandar: lo que define
 * un viaje es que la comida salga en moto, no de dónde vino el pedido.
 *
 * Body JSON:
 *   date: "YYYY-MM-DD"  (opcional; la jornada que arrancó ese día.
 *                        Sin esto, la jornada en curso.)
 *
 * Respuesta: { ok, shift: {...}, count, shippingTotal, itemsTotal, orders: [...] }
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero']);

$in    = body_json();
$date  = trim((string) ($in['date'] ?? ''));
$shift = byr_shift_bounds($date !== '' ? $date : null);

/* La columna del envío es de una migración posterior: si no está, se pide 0
   para que el contador de viajes siga saliendo igual. */
$shipSel = byr_shipping_ready($pdo) ? 'o.shipping_cost' : '0 AS shipping_cost';

$stmt = $pdo->prepare(
    "SELECT o.id, o.status, o.customer_name, o.customer_phone, o.address,
            o.items_total, $shipSel, o.created_at
       FROM orders o
      WHERE o.fulfillment = 'delivery'
        AND o.status <> 'cancelled'
        AND o.created_at >= ? AND o.created_at < ?
      ORDER BY o.created_at ASC"
);
$stmt->execute([$shift['startDb'], $shift['endDb']]);
$rows = $stmt->fetchAll();

$orders        = [];
$shippingTotal = 0;
$itemsTotal    = 0;

foreach ($rows as $r) {
    $ship = (int) $r['shipping_cost'];
    $shippingTotal += $ship;
    $itemsTotal    += (int) $r['items_total'];

    $orders[] = [
        'id'           => (int) $r['id'],
        'status'       => $r['status'],
        'customerName' => $r['customer_name'],
        'address'      => $r['address'],
        'itemsTotal'   => (int) $r['items_total'],
        'shippingCost' => $ship,
        'whenLabel'    => byr_dt_label($r['created_at'], 'H:i'),
    ];
}

json_out([
    'ok'    => true,
    'shift' => $shift,
    'count' => count($orders),

    /* El envío realmente cobrado en cada pedido, sumado. Debería dar igual que
       cantidad x tarifa, pero se manda aparte a propósito: si alguna vez no
       coincide (cambió el precio del envío en el medio, o entró un pedido sin
       envío), es mejor verlo que arrastrar la diferencia a la cuenta. */
    'shippingTotal' => $shippingTotal,
    'itemsTotal'    => $itemsTotal,
    'orders'        => $orders,
]);
