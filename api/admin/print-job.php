<?php
/**
 * Manda a imprimir a la térmica desde el panel (reimprimir una comanda, sacar
 * el ticket de un pedido, o probar la impresora). Staff.
 *
 * Body JSON: { orderId?: int, sessionId?: int, kind: "comanda"|"ticket"|"test"|"report" }
 *
 * `report` es el cierre de caja (Z) y va con sessionId, no con orderId.
 *
 * No imprime acá: deja el trabajo en la cola y el agente del local lo saca.
 * Por eso responde al toque aunque la impresora esté ocupada o apagada.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../printing.php';
require_method('POST');

$pdo  = db();
$me   = require_role($pdo, ['cajero', 'cocina']);
$role = byr_role($pdo, $me);

if (!byr_print_ready($pdo)) {
    json_out([
        'error' => 'Falta correr 2026-08-print-jobs.sql en phpMyAdmin.',
        'code'  => 'not-ready',
    ], 409);
}

$in        = body_json();
$kind      = trim((string) ($in['kind'] ?? 'comanda'));
$orderId   = (int) ($in['orderId'] ?? 0);
$sessionId = (int) ($in['sessionId'] ?? 0);

if (!in_array($kind, ['comanda', 'ticket', 'test', 'report'], true)) {
    json_out(['error' => 'Tipo de impresión inválido.'], 422);
}
/* La cocina no imprime nada con plata: ni tickets ni cierres de caja. */
if ($role === 'cocina' && ($kind === 'ticket' || $kind === 'report')) {
    json_out(['error' => 'No tenés permisos para imprimir eso.'], 403);
}
if ($kind === 'report' && $sessionId <= 0) {
    json_out(['error' => 'Falta el turno de caja.'], 422);
}
if (!in_array($kind, ['test', 'report'], true) && $orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

$jobId = byr_print_enqueue(
    $pdo,
    $kind,
    in_array($kind, ['test', 'report'], true) ? null : $orderId,
    $me,
    $kind === 'report' ? $sessionId : null
);
if (!$jobId) {
    json_out(['error' => 'No se pudo encolar la impresión (¿existe ese pedido o turno?).'], 422);
}

json_out(['ok' => true, 'jobId' => $jobId, 'kind' => $kind]);
