<?php
/**
 * El agente confirma qué pasó con un trabajo que había tomado.
 *
 * POST api/print/ack.php
 * Header obligatorio:  X-BYR-Print-Token: <print_token de config.php>
 * Body JSON: { jobId: int, ok: bool, error?: string }
 *
 * ok=true  → 'done'.
 * ok=false → vuelve a 'pending' para reintentar (típico: impresora apagada o
 *            sin papel), salvo que ya se hayan gastado los 5 intentos: ahí
 *            queda en 'error' y se ve en el panel.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../printing.php';
require_method('POST');

$pdo = db();
byr_print_require_token();

if (!byr_print_ready($pdo)) {
    json_out(['error' => 'Falta correr 2026-08-print-jobs.sql en phpMyAdmin.', 'code' => 'not-ready'], 503);
}

$in    = body_json();
$jobId = (int) ($in['jobId'] ?? 0);
$ok    = !empty($in['ok']);
$err   = trim((string) ($in['error'] ?? ''));
$err   = $err !== '' ? substr($err, 0, 255) : null;

if ($jobId <= 0) {
    json_out(['error' => 'Falta el trabajo.'], 422);
}

$stmt = $pdo->prepare('SELECT status, attempts FROM print_jobs WHERE id = ?');
$stmt->execute([$jobId]);
$job = $stmt->fetch();
if (!$job) {
    json_out(['error' => 'No existe ese trabajo.'], 404);
}

if ($ok) {
    $pdo->prepare(
        "UPDATE print_jobs SET status = 'done', printed_at = NOW(), last_error = NULL WHERE id = ?"
    )->execute([$jobId]);
    json_out(['ok' => true, 'status' => 'done']);
}

$status = ((int) $job['attempts'] >= 5) ? 'error' : 'pending';
$pdo->prepare('UPDATE print_jobs SET status = ?, last_error = ? WHERE id = ?')
    ->execute([$status, $err ?? 'Falló la impresión', $jobId]);

json_out(['ok' => true, 'status' => $status]);
