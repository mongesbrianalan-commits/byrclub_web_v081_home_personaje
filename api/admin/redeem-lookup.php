<?php
/** Busca un vale de premio por su código. Solo admin. Sirve para validar. */
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

$stmt = $pdo->prepare(
    'SELECT r.code, r.prize_id, r.prize_label, r.status, r.created_at, r.expires_at, r.redeemed_at,
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

/* El 2x1 pedido por la web ya se consumió en el pedido: no es un vale para
   mostrar en el local. Lo marcamos aparte para que el panel lo pueda decir
   con todas las letras en vez de un genérico "ya fue canjeado". */
$usedOnWeb = (($row['prize_id'] ?? '') === BYR_2X1_PRIZE_ID_WEB);

json_out([
    'redemption' => [
        'code'       => $row['code'],
        'prize'      => $row['prize_label'],
        'status'     => $row['status'],
        'expired'    => $expired,
        'usedOnWeb'  => $usedOnWeb,
        'customer'   => $row['customer_name'],
        'email'      => $row['customer_email'],
        'createdAt'  => $row['created_at'],
        'expiresAt'  => $row['expires_at'],
        'redeemedAt' => $row['redeemed_at'],
    ],
]);
