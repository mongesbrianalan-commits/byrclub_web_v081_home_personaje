<?php
/**
 * El agente del local viene acá a buscar trabajos para imprimir.
 *
 * GET api/print/jobs.php?station=cocina&max=5
 * Header obligatorio:  X-BYR-Print-Token: <print_token de config.php>
 *
 * Los trabajos que entrega quedan en 'printing' (tomados). El agente después
 * confirma con ack.php. Si el agente se cuelga o se corta la luz, el trabajo
 * vuelve solo a 'pending' a los 2 minutos y se reintenta.
 *
 * Respuesta: { ok, station, jobs: [{ id, kind, orderId, payload(base64) }] }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../printing.php';
require_method('GET');

$pdo = db();
byr_print_require_token();

if (!byr_print_ready($pdo)) {
    json_out(['error' => 'Falta correr 2026-08-print-jobs.sql en phpMyAdmin.', 'code' => 'not-ready'], 503);
}

$station = trim((string) ($_GET['station'] ?? 'cocina'));
$station = $station !== '' ? substr($station, 0, 30) : 'cocina';
$max     = (int) ($_GET['max'] ?? 5);
$max     = max(1, min($max, 20));

/* --- Rescate de trabajos huérfanos ---------------------------------------
   Si el agente los tomó y nunca confirmó (se cerró, se cortó la red), a los
   2 minutos vuelven a la cola. Después de 5 intentos se dan por perdidos
   para no quedar reimprimiendo lo mismo para siempre. */
$pdo->prepare(
    "UPDATE print_jobs
        SET status = 'error', last_error = 'Sin confirmación del agente'
      WHERE station = ? AND status = 'printing'
        AND taken_at < (NOW() - INTERVAL 2 MINUTE) AND attempts >= 5"
)->execute([$station]);

$pdo->prepare(
    "UPDATE print_jobs
        SET status = 'pending'
      WHERE station = ? AND status = 'printing'
        AND taken_at < (NOW() - INTERVAL 2 MINUTE) AND attempts < 5"
)->execute([$station]);

/* --- Tomar los pendientes (bloqueados para que dos agentes no se pisen) --- */
$jobs = [];
$pdo->beginTransaction();
try {
    $sel = $pdo->prepare(
        "SELECT id, kind, order_id, payload
           FROM print_jobs
          WHERE station = ? AND status = 'pending'
          ORDER BY id ASC
          LIMIT $max
          FOR UPDATE"
    );
    $sel->execute([$station]);
    $rows = $sel->fetchAll();

    if ($rows) {
        $ids = array_map(static fn($r) => (int) $r['id'], $rows);
        $in  = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare(
            "UPDATE print_jobs
                SET status = 'printing', taken_at = NOW(), attempts = attempts + 1
              WHERE id IN ($in)"
        )->execute($ids);

        foreach ($rows as $r) {
            $jobs[] = [
                'id'      => (int) $r['id'],
                'kind'    => $r['kind'],
                'orderId' => $r['order_id'] !== null ? (int) $r['order_id'] : null,
                'payload' => $r['payload'],   // ESC/POS en base64
            ];
        }
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No se pudo leer la cola de impresión.'], 500);
}

json_out(['ok' => true, 'station' => $station, 'jobs' => $jobs]);
