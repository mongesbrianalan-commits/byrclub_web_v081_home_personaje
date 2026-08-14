<?php
/**
 * Registra un movimiento de efectivo (ingreso/egreso) que NO es venta:
 * retiro, pago a proveedor, ingreso de vuelto, etc. Solo admin.
 *
 * Body JSON: { type: "in"|"out", amount: int, reason?: string }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

$in     = body_json();
$type   = ($in['type'] ?? '') === 'out' ? 'out' : (($in['type'] ?? '') === 'in' ? 'in' : '');
$amount = (int) ($in['amount'] ?? 0);
$reason = trim((string) ($in['reason'] ?? ''));

if ($type === '') {
    json_out(['error' => 'Elegí si es ingreso o egreso.'], 422);
}
if ($amount <= 0) {
    json_out(['error' => 'El monto debe ser mayor a cero.'], 422);
}

$s = byr_open_session($pdo);
if (!$s) {
    json_out(['error' => 'No hay una caja abierta.', 'code' => 'no-session'], 409);
}

$stmt = $pdo->prepare(
    'INSERT INTO cash_movements (session_id, type, amount, reason, created_by) VALUES (?, ?, ?, ?, ?)'
);
$stmt->execute([
    (int) $s['id'],
    $type,
    $amount,
    $reason !== '' ? mb_substr($reason, 0, 200) : null,
    $admin,
]);

$totals = byr_session_totals($pdo, (int) $s['id'], (int) $s['opening_float']);
json_out(['ok' => true, 'totals' => $totals]);
