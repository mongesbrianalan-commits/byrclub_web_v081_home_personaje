<?php
/**
 * Avanza el estado de un pedido YA aceptado (confirmed → preparing → on_the_way
 * → delivered). No toca puntos ni cobro (eso pasa en orders-confirm). Solo staff.
 *
 * Transiciones válidas (evita saltos raros):
 *   confirmed  → preparing
 *   preparing  → on_the_way | delivered
 *   on_the_way → delivered
 *
 * Body JSON: { orderId: int, status: string }
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$pdo   = db();
$staff = require_role($pdo, ['cajero']);

$in      = body_json();
$orderId = (int) ($in['orderId'] ?? 0);
$target  = trim((string) ($in['status'] ?? ''));
if ($orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

$flow = [
    'confirmed'  => ['preparing'],
    'preparing'  => ['on_the_way', 'delivered'],
    'on_the_way' => ['delivered'],
];

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT status FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        $pdo->rollBack();
        json_out(['error' => 'No existe ese pedido.'], 404);
    }

    $current = $order['status'];
    if (!isset($flow[$current]) || !in_array($target, $flow[$current], true)) {
        $pdo->rollBack();
        json_out(['error' => 'Ese cambio de estado no es válido.', 'status' => $current], 409);
    }

    $upd = $pdo->prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?');
    $upd->execute([$target, $orderId, $current]);

    /* Si el ENUM todavía no tiene los estados nuevos (falta la migración), MySQL
       podría no guardar el valor: verificamos antes de confirmar. */
    $check = $pdo->prepare('SELECT status FROM orders WHERE id = ?');
    $check->execute([$orderId]);
    $after = $check->fetch();
    if (!$after || $after['status'] !== $target) {
        $pdo->rollBack();
        json_out([
            'error' => 'No se pudo cambiar el estado. ¿Corriste la migración 2026-08-order-stages.sql?',
            'code'  => 'not-ready',
        ], 409);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No se pudo actualizar el estado. Probá de nuevo.'], 500);
}

json_out(['ok' => true, 'orderId' => $orderId, 'status' => $target]);
