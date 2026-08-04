<?php
/**
 * Vale de "Hamburguesa de cumpleaños": 1 por año, solo durante el mes de
 * cumpleaños del usuario. Reusa la tabla `redemptions` (mismo canje que la
 * ruleta), así el admin lo valida con la misma herramienta.
 * Idempotente: si ya existe el vale de este año, devuelve ese mismo.
 */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT birthdate FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row || empty($row['birthdate'])) {
    json_out(['voucher' => null]); // no cargó cumpleaños
}

$birthMonth = (int) substr($row['birthdate'], 5, 2);
$curMonth   = (int) date('n');
$year       = (int) date('Y');

if ($birthMonth !== $curMonth) {
    json_out(['voucher' => null]); // no es su mes de cumple
}

/* ¿Ya tiene el vale de este año? */
$stmt = $pdo->prepare(
    "SELECT code, status FROM redemptions
      WHERE user_id = ? AND prize_id = 'birthday-burger' AND YEAR(created_at) = ?
      LIMIT 1"
);
$stmt->execute([$id, $year]);
$existing = $stmt->fetch();
if ($existing) {
    json_out(['voucher' => ['code' => $existing['code'], 'status' => $existing['status']]]);
}

/* Si no, lo generamos (una sola vez al año). */
$code = byr_generate_redemption_code($pdo);
$ins  = $pdo->prepare(
    "INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status)
     VALUES (?, ?, 'birthday-burger', 'Hamburguesa de cumpleaños', 'Cumpleaños', 'pending')"
);
$ins->execute([$id, $code]);

json_out(['voucher' => ['code' => $code, 'status' => 'pending']]);
