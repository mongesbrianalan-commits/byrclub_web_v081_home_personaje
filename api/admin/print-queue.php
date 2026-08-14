<?php
/**
 * Estado de la cola de impresión, para que el panel pueda avisar cuando la
 * térmica no está respondiendo. Staff.
 *
 * No hace falta que el agente reporte "estoy vivo": si hay trabajos esperando
 * hace más de un minuto, es que nadie los está sacando. Ese es el síntoma que
 * le importa al que está atendiendo.
 *
 * Respuesta: { ok, ready, pending, errors, stuckSeconds, lastPrintedAt, lastError }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../printing.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero', 'cocina']);

if (!byr_print_ready($pdo)) {
    json_out(['ok' => true, 'ready' => false]);
}

$row = $pdo->query(
    "SELECT
        SUM(status IN ('pending','printing'))                          AS pending,
        SUM(status = 'error')                                          AS errors,
        MAX(CASE WHEN status = 'done' THEN printed_at END)             AS last_printed_at,
        MIN(CASE WHEN status IN ('pending','printing') THEN created_at END) AS oldest_waiting
       FROM print_jobs
      WHERE created_at > (NOW() - INTERVAL 1 DAY)"
)->fetch();

$oldest = $row && $row['oldest_waiting'] ? strtotime($row['oldest_waiting']) : null;
$stuck  = $oldest ? max(0, time() - $oldest) : 0;

$errRow = $pdo->query(
    "SELECT last_error FROM print_jobs
      WHERE status = 'error' AND last_error IS NOT NULL
      ORDER BY id DESC LIMIT 1"
)->fetch();

json_out([
    'ok'            => true,
    'ready'         => true,
    'pending'       => (int) ($row['pending'] ?? 0),
    'errors'        => (int) ($row['errors'] ?? 0),
    'stuckSeconds'  => $stuck,
    'lastPrintedAt' => $row['last_printed_at'] ?? null,
    'lastError'     => $errRow['last_error'] ?? null,
]);
