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

/* Canje atómico: solo pasa a 'redeemed' si estaba 'pending' y NO venció.
   Así dos cargas simultáneas no pueden canjear dos veces, y un vale
   vencido nunca se canjea. */
$upd = $pdo->prepare(
    'UPDATE redemptions
        SET status = "redeemed", redeemed_at = NOW(), redeemed_by = ?
      WHERE code = ? AND status = "pending"
        AND (expires_at IS NULL OR expires_at > NOW())'
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

/* No se actualizó: o no existe, o ya estaba canjeado, o venció. Averiguamos cuál. */
$stmt = $pdo->prepare(
    'SELECT status, redeemed_at, expires_at,
            (expires_at IS NOT NULL AND expires_at <= NOW()) AS is_expired
       FROM redemptions WHERE code = ?'
);
$stmt->execute([$code]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No existe ningún premio con ese código.', 'code' => 'not-found'], 404);
}
if ($row['status'] === 'pending' && (int) $row['is_expired'] === 1) {
    json_out([
        'error'     => 'Este premio VENCIÓ y ya no se puede canjear.',
        'code'      => 'expired',
        'expiresAt' => $row['expires_at'],
    ], 409);
}
json_out([
    'error'      => 'Este premio YA fue canjeado.',
    'code'       => 'already-redeemed',
    'redeemedAt' => $row['redeemed_at'],
], 409);
