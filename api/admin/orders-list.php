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
$allowed = ['pending', 'confirmed', 'cancelled'];

$sql = 'SELECT o.id, o.user_id, o.status, o.fulfillment, o.customer_name, o.customer_phone,
               o.address, o.notes, o.items_total, o.points_suggested, o.points_awarded,
               o.coupon_code, o.coupon_label, o.created_at, o.confirmed_at,
               u.email AS customer_email
          FROM orders o
          JOIN users u ON u.id = o.user_id';
$params = [];
if (in_array($status, $allowed, true)) {
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
$stmt = $pdo->prepare(
    "SELECT order_id, name, options, unit_price, qty, subtotal
       FROM order_items WHERE order_id IN ($placeholders) ORDER BY id ASC"
);
$stmt->execute($ids);

$itemsByOrder = [];
foreach ($stmt->fetchAll() as $it) {
    $itemsByOrder[(int) $it['order_id']][] = [
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
        'customerName'   => $o['customer_name'],
        'customerPhone'  => $o['customer_phone'],
        'customerEmail'  => $o['customer_email'],
        'address'        => $o['address'],
        'notes'          => $o['notes'],
        'itemsTotal'     => (int) $o['items_total'],
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
