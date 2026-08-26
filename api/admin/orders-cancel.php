<?php
/**
 * Cancela un pedido pendiente. Solo admin.
 * No acredita puntos y NO toca el cupón adjunto (queda disponible para el socio).
 *
 * Si el pedido llevaba el 2x1 de socio, se lo devolvemos: pedirlo y que el
 * local cancele te dejaba sin beneficio hasta el miércoles siguiente.
 *
 * Body JSON: { orderId: int }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../perks/2x1.php';
require_method('POST');

$pdo   = db();
$admin = require_role($pdo, ['cajero']);

$in      = body_json();
$orderId = (int) ($in['orderId'] ?? 0);
if ($orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

/* De quién es el pedido, para poder devolverle el 2x1 si lo llevaba. */
$who = $pdo->prepare('SELECT user_id FROM orders WHERE id = ?');
$who->execute([$orderId]);
$userId = (int) ($who->fetchColumn() ?: 0);

/* Solo pasa a cancelado si estaba pendiente (idempotente / anti doble acción). */
$upd = $pdo->prepare(
    'UPDATE orders
        SET status = "cancelled", confirmed_at = NOW(), confirmed_by = ?
      WHERE id = ? AND status = "pending"'
);
$upd->execute([$admin, $orderId]);

if ($upd->rowCount() === 1) {
    /* Va DESPUÉS del UPDATE condicional: así una doble cancelación no le
       devuelve el beneficio dos veces. */
    $released = $userId > 0 && byr_2x1_release_for_order($pdo, $userId, $orderId);

    json_out([
        'ok'          => true,
        'orderId'     => $orderId,
        'status'      => 'cancelled',
        'perk2x1Back' => $released,
    ]);
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
