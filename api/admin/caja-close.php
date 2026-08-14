<?php
/**
 * Cierra la caja abierta: calcula el efectivo esperado y la diferencia contra
 * lo contado (arqueo), y devuelve el reporte Z. Solo admin.
 *
 * Body JSON: { countedCash?: int }  (efectivo contado a mano; opcional)
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

$in      = body_json();
$counted = array_key_exists('countedCash', $in) && $in['countedCash'] !== '' && $in['countedCash'] !== null
    ? (int) $in['countedCash']
    : null;

$s = byr_open_session($pdo);
if (!$s) {
    json_out(['error' => 'No hay una caja abierta.', 'code' => 'no-session'], 409);
}

$totals   = byr_session_totals($pdo, (int) $s['id'], (int) $s['opening_float']);
$expected = (int) $totals['expectedCash'];
$diff     = $counted !== null ? $counted - $expected : null;

$upd = $pdo->prepare(
    'UPDATE cash_sessions
        SET status = "closed", closed_by = ?, closed_at = NOW(),
            expected_cash = ?, counted_cash = ?, difference = ?
      WHERE id = ? AND status = "open"'
);
$upd->execute([$admin, $expected, $counted, $diff, (int) $s['id']]);

json_out([
    'ok' => true,
    'z'  => [
        'sessionId'    => (int) $s['id'],
        'openedAt'     => $s['opened_at'],
        'openingFloat' => (int) $s['opening_float'],
        'expectedCash' => $expected,
        'countedCash'  => $counted,
        'difference'   => $diff,
        'totals'       => $totals,
    ],
]);
