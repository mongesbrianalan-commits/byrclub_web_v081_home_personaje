<?php
/**
 * Abre la caja (crea una sesión 'open' con el fondo inicial). Solo admin.
 * Rechaza si ya hay una caja abierta (por ahora una sola caja).
 *
 * Body JSON: { openingFloat: int }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

$in    = body_json();
$float = (int) ($in['openingFloat'] ?? 0);
if ($float < 0) {
    json_out(['error' => 'El fondo inicial no puede ser negativo.'], 422);
}

if (byr_open_session($pdo)) {
    json_out(['error' => 'Ya hay una caja abierta. Cerrala antes de abrir otra.', 'code' => 'already-open'], 409);
}

$stmt = $pdo->prepare(
    'INSERT INTO cash_sessions (status, opened_by, opening_float) VALUES ("open", ?, ?)'
);
$stmt->execute([$admin, $float]);

json_out(['ok' => true, 'sessionId' => (int) $pdo->lastInsertId()]);
