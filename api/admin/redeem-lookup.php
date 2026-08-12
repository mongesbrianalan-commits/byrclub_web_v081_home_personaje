<?php
/** Busca un vale de premio por su código. Solo admin. Sirve para validar. */
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

$stmt = $pdo->prepare(
    'SELECT r.code, r.prize_label, r.status, r.created_at, r.expires_at, r.redeemed_at,
            (r.expires_at IS NOT NULL AND r.expires_at <= NOW()) AS is_expired,
            u.name AS customer_name, u.email AS customer_email
       FROM redemptions r
       JOIN users u ON u.id = r.user_id
      WHERE r.code = ?'
);
$stmt->execute([$code]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No existe ningún premio con ese código.', 'code' => 'not-found'], 404);
}

$expired = $row['status'] === 'pending' && (int) $row['is_expired'] === 1;

json_out([
    'redemption' => [
        'code'       => $row['code'],
        'prize'      => $row['prize_label'],
        'status'     => $row['status'],
        'expired'    => $expired,
        'customer'   => $row['customer_name'],
        'email'      => $row['customer_email'],
        'createdAt'  => $row['created_at'],
        'expiresAt'  => $row['expires_at'],
        'redeemedAt' => $row['redeemed_at'],
    ],
]);
