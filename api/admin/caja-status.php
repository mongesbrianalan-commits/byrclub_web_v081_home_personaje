<?php
/**
 * Estado de la caja para el panel admin: si hay una abierta, la devuelve junto
 * con sus totales en vivo (reporte X). Solo admin.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';

$pdo = db();
require_role($pdo, ['cajero']);

if (!byr_caja_ready($pdo)) {
    json_out(['ready' => false, 'open' => false, 'session' => null]);
}

$s = byr_open_session($pdo);
if (!$s) {
    json_out(['open' => false, 'session' => null]);
}

$totals = byr_session_totals($pdo, (int) $s['id'], (int) $s['opening_float']);
json_out([
    'open'    => true,
    'session' => [
        'id'           => (int) $s['id'],
        'openedAt'     => $s['opened_at'],
        'openingFloat' => (int) $s['opening_float'],
    ],
    'totals'  => $totals,
]);
