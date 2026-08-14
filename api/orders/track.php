<?php
/**
 * Estado de un pedido para el seguimiento SIN login (pedido de invitado).
 *
 * Se valida con el teléfono: hay que acertar los últimos 8 dígitos del WhatsApp
 * con el que se hizo el pedido, así el estado no queda expuesto a cualquiera.
 *
 * GET ?id=<int>&phone=<string>  →  { status }
 */
require_once __DIR__ . '/../helpers.php';

$id    = (int) ($_GET['id'] ?? 0);
$phone = trim((string) ($_GET['phone'] ?? ''));
if ($id <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT status, customer_phone FROM orders WHERE id = ?');
$stmt->execute([$id]);
$order = $stmt->fetch();
if (!$order) {
    json_out(['error' => 'No existe ese pedido.'], 404);
}

$want = substr(preg_replace('/\D/', '', $phone), -8);
$have = substr(preg_replace('/\D/', '', (string) $order['customer_phone']), -8);
if ($want === '' || $want !== $have) {
    json_out(['error' => 'El teléfono no coincide con el pedido.'], 403);
}

json_out(['status' => $order['status']]);
