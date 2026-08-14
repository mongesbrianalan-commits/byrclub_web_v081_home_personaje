<?php
/**
 * Lista de pedidos para el panel del admin.
 *
 * Por defecto trae los PENDIENTES primero (los que hay que preparar/confirmar),
 * con el cliente, los ítems, el total, la forma de entrega y el cupón adjunto.
 * Con ?status=pending|confirmed|cancelled se filtra; sin filtro trae todo
 * (últimos primero, pendientes arriba).
 */
require_once __DIR__ . '/../helpers.php';

$pdo = db();
require_role($pdo, ['cajero', 'cocina']);

$status = $_GET['status'] ?? '';
$allowed = ['pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'];

/* El envío es una columna nueva: si la migración no está corrida, se pide 0. */
$shipSel = byr_shipping_ready($pdo) ? 'o.shipping_cost' : '0 AS shipping_cost';

$sql = "SELECT o.id, o.user_id, o.status, o.fulfillment, o.customer_name, o.customer_phone,
               o.address, o.notes, o.items_total, $shipSel, o.points_suggested, o.points_awarded,
               o.coupon_code, o.coupon_label, o.created_at, o.confirmed_at,
               u.email AS customer_email
          FROM orders o
          JOIN users u ON u.id = o.user_id";
$params = [];
if ($status === 'active') {
    // "En curso": aceptados que todavía se están preparando/entregando.
    $sql .= ' WHERE o.status IN ("confirmed", "preparing", "on_the_way")';
} elseif (in_array($status, $allowed, true)) {
    $sql .= ' WHERE o.status = ?';
    $params[] = $status;
}
$sql .= ' ORDER BY (o.status = "pending") DESC, o.created_at DESC LIMIT 100';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$orders = $stmt->fetchAll();

if (!$orders) {
    json_out(['orders' => []]);
}

/* Ítems de todos los pedidos en una sola consulta. */
$ids          = array_column($orders, 'id');
$placeholders = implode(',', array_fill(0, count($ids), '?'));
/* Se trae también el slug del producto: el editor del panel lo necesita para
   saber si esa línea lleva opciones (papas/bebida/adicionales). */
$stmt = $pdo->prepare(
    "SELECT oi.id, oi.order_id, oi.name, oi.options, oi.unit_price, oi.qty, oi.subtotal,
            oi.product_id, p.slug AS product_slug
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id IN ($placeholders) ORDER BY oi.id ASC"
);
$stmt->execute($ids);

$itemsByOrder = [];
foreach ($stmt->fetchAll() as $it) {
    $itemsByOrder[(int) $it['order_id']][] = [
        'id'       => (int) $it['id'],
        'name'     => $it['name'],
        'options'  => $it['options'],
        'unitPrice' => (int) $it['unit_price'],
        'qty'      => (int) $it['qty'],
        'subtotal' => (int) $it['subtotal'],
        'productSlug' => $it['product_slug'],
    ];
}

$out = [];
foreach ($orders as $o) {
    $oid = (int) $o['id'];
    $out[] = [
        'id'             => $oid,
        'status'         => $o['status'],
        'fulfillment'    => $o['fulfillment'],
        'customerName'   => $o['customer_name'],
        'customerPhone'  => $o['customer_phone'],
        'customerEmail'  => $o['customer_email'],
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
        'items'          => $itemsByOrder[$oid] ?? [],
    ];
}

json_out(['orders' => $out]);
