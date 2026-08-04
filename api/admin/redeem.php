<?php
/** Marca un vale de premio como canjeado. Solo admin. No se puede reusar. */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

$in   = body_json();
$code = strtoupper(trim($in['code'] ?? ''));
if ($code === '') {
    json_out(['error' => 'Escribí un código.'], 422);
}

/* Canje atómico: solo pasa a 'redeemed' si estaba 'pending'.
   Así dos cargas simultáneas no pueden canjear dos veces. */
$upd = $pdo->prepare(
    'UPDATE redemptions
        SET status = "redeemed", redeemed_at = NOW(), redeemed_by = ?
      WHERE code = ? AND status = "pending"'
);
$upd->execute([$id, $code]);

if ($upd->rowCount() === 1) {
    $stmt = $pdo->prepare(
        'SELECT r.prize_label, r.redeemed_at, u.name AS customer_name
           FROM redemptions r JOIN users u ON u.id = r.user_id
          WHERE r.code = ?'
    );
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    json_out([
        'ok'       => true,
        'prize'    => $row['prize_label'] ?? '',
        'customer' => $row['customer_name'] ?? '',
    ]);
}

/* No se actualizó: o no existe, o ya estaba canjeado. Averiguamos cuál. */
$stmt = $pdo->prepare('SELECT status, redeemed_at FROM redemptions WHERE code = ?');
$stmt->execute([$code]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No existe ningún premio con ese código.', 'code' => 'not-found'], 404);
}
json_out([
    'error'      => 'Este premio YA fue canjeado.',
    'code'       => 'already-redeemed',
    'redeemedAt' => $row['redeemed_at'],
], 409);
