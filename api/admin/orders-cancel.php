<?php
/**
 * Cancela un pedido pendiente. Solo admin.
 * No acredita puntos y NO toca el cupón adjunto (queda disponible para el socio).
 *
 * Body JSON: { orderId: int }
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

$in      = body_json();
$orderId = (int) ($in['orderId'] ?? 0);
if ($orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

/* Solo pasa a cancelado si estaba pendiente (idempotente / anti doble acción). */
$upd = $pdo->prepare(
    'UPDATE orders
        SET status = "cancelled", confirmed_at = NOW(), confirmed_by = ?
      WHERE id = ? AND status = "pending"'
);
$upd->execute([$admin, $orderId]);

if ($upd->rowCount() === 1) {
    json_out(['ok' => true, 'orderId' => $orderId, 'status' => 'cancelled']);
}

/* No se actualizó: no existe o ya no estaba pendiente. */
$stmt = $pdo->prepare('SELECT status FROM orders WHERE id = ?');
$stmt->execute([$orderId]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No existe ese pedido.'], 404);
}
json_out([
    'error'  => 'Ese pedido ya fue ' . ($row['status'] === 'confirmed' ? 'confirmado' : 'cancelado') . '.',
    'status' => $row['status'],
], 409);
