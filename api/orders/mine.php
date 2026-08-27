<?php
/**
 * Pedidos del socio logueado — fuente de "Mis pedidos" en el perfil.
 *
 * Devuelve los pedidos con sus ítems y el estado real (Pendiente / Confirmado
 * / Cancelado) más los puntos que se acreditaron al confirmar.
 */
require_once __DIR__ . '/../helpers.php';

$id  = require_auth();
$pdo = db();

/* El envío es una columna nueva: si la migración no está corrida, se pide 0. */
$shipSel = byr_shipping_ready($pdo) ? 'shipping_cost' : '0 AS shipping_cost';

$stmt = $pdo->prepare(
    "SELECT id, status, fulfillment, address, notes, items_total, $shipSel,
            points_suggested, points_awarded, coupon_code, coupon_label,
            created_at, confirmed_at
       FROM orders
      WHERE user_id = ?
      ORDER BY (status = \"pending\") DESC, created_at DESC
      LIMIT 50"
);
$stmt->execute([$id]);
$orders = $stmt->fetchAll();

if (!$orders) {
    json_out(['orders' => []]);
}

/* Ítems de todos los pedidos en una sola consulta. */
$ids          = array_column($orders, 'id');
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare(
    "SELECT order_id, name, options, unit_price, qty, subtotal
       FROM order_items
      WHERE order_id IN ($placeholders)
      ORDER BY id ASC"
);
$stmt->execute($ids);

$itemsByOrder = [];
foreach ($stmt->fetchAll() as $it) {
    $oid = (int) $it['order_id'];
    $itemsByOrder[$oid][] = [
        'name'     => $it['name'],
        'options'  => $it['options'],
        'unitPrice' => (int) $it['unit_price'],
        'qty'      => (int) $it['qty'],
        'subtotal' => (int) $it['subtotal'],
    ];
}

$out = [];
foreach ($orders as $o) {
    $oid = (int) $o['id'];
    $out[] = [
        'id'             => $oid,
        'status'         => $o['status'],
        'fulfillment'    => $o['fulfillment'],
        'address'        => $o['address'],
        'notes'          => $o['notes'],
        'itemsTotal'     => (int) $o['items_total'],
        'shippingCost'   => (int) $o['shipping_cost'],
        'total'          => (int) $o['items_total'] + (int) $o['shipping_cost'],
        'pointsSuggested' => (int) $o['points_suggested'],
        'pointsAwarded'  => $o['points_awarded'] === null ? null : (int) $o['points_awarded'],
        'couponCode'     => $o['coupon_code'],
        'couponLabel'    => $o['coupon_label'],
        'createdAt'      => $o['created_at'],
        'confirmedAt'    => $o['confirmed_at'],

        /* Formateadas en hora de Argentina por el servidor (la base guarda en
           UTC): el socio veía su pedido con 3 horas de más. */
        'createdAtLabel'   => byr_dt_label($o['created_at']),
        'confirmedAtLabel' => byr_dt_label($o['confirmed_at']),
        'items'          => $itemsByOrder[$oid] ?? [],
    ];
}

json_out(['orders' => $out]);
