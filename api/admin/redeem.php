<?php
/** Marca un vale de premio como canjeado. Solo admin. No se puede reusar. */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../perks/2x1.php';
require_method('POST');

$pdo = db();
$id  = require_role($pdo, ['cajero']);

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
    'SELECT prize_id, prize_label, status, redeemed_at, expires_at,
            (expires_at IS NOT NULL AND expires_at <= NOW()) AS is_expired,
            DATE(redeemed_at) = CURDATE() AS redeemed_today
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

/* El 2x1 pedido por la web no es un vale para mostrar: ya se consumió en el
   pedido. Si el socio igual lo trae al local, el cajero tiene que entender
   de una qué pasó — y no quedar dudando si el cliente vino más temprano. */
if (($row['prize_id'] ?? '') === BYR_2X1_PRIZE_ID_WEB) {
    json_out([
        'error'      => 'Este socio YA USÓ su 2x1 de hoy: lo pidió por la web. No corresponde dárselo de nuevo.',
        'code'       => 'perk-2x1-used-web',
        'prize'      => $row['prize_label'],
        'redeemedAt' => $row['redeemed_at'],
    ], 409);
}

$hoy = ((int) ($row['redeemed_today'] ?? 0) === 1);

json_out([
    'error'      => $hoy
        ? 'Este premio YA fue canjeado HOY.'
        : 'Este premio YA fue canjeado.',
    'code'       => 'already-redeemed',
    'prize'      => $row['prize_label'],
    'redeemedToday' => $hoy,
    'redeemedAt' => $row['redeemed_at'],
], 409);
