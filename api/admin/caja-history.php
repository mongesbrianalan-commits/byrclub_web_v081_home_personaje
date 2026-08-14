<?php
/**
 * Historial de cierres de caja (últimos turnos cerrados) para el panel.
 * Los totales por medio de pago y de efectivo se recalculan de `payments` /
 * `cash_movements`, así reflejan lo real de cada turno. Solo staff.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';

$pdo = db();
require_role($pdo, ['cajero']);

if (!byr_caja_ready($pdo)) {
    json_out(['ready' => false, 'sessions' => []]);
}

/* Últimos turnos cerrados (con quién abrió/cerró). */
$rows = $pdo->query(
    "SELECT s.id, s.opened_at, s.closed_at, s.opening_float,
            s.expected_cash, s.counted_cash, s.difference,
            uo.name AS opened_by_name, uc.name AS closed_by_name
       FROM cash_sessions s
       LEFT JOIN users uo ON uo.id = s.opened_by
       LEFT JOIN users uc ON uc.id = s.closed_by
      WHERE s.status = 'closed'
      ORDER BY s.id DESC
      LIMIT 40"
)->fetchAll();

if (!$rows) {
    json_out(['ready' => true, 'sessions' => []]);
}

$ids          = array_column($rows, 'id');
$placeholders = implode(',', array_fill(0, count($ids), '?'));

/* Ventas por medio de pago, agrupadas por turno (una sola consulta). */
$byMethod = [];
$stmt = $pdo->prepare(
    "SELECT session_id, method, SUM(amount) AS total, COUNT(*) AS n
       FROM payments WHERE session_id IN ($placeholders) GROUP BY session_id, method"
);
$stmt->execute($ids);
foreach ($stmt->fetchAll() as $r) {
    $sid = (int) $r['session_id'];
    if (!isset($byMethod[$sid])) {
        $byMethod[$sid] = ['methods' => array_fill_keys(byr_payment_methods(), 0), 'count' => 0];
    }
    if (isset($byMethod[$sid]['methods'][$r['method']])) {
        $byMethod[$sid]['methods'][$r['method']] = (int) $r['total'];
    }
    $byMethod[$sid]['count'] += (int) $r['n'];
}

/* Movimientos de efectivo por turno. */
$moves = [];
$stmt = $pdo->prepare(
    "SELECT session_id, type, SUM(amount) AS total
       FROM cash_movements WHERE session_id IN ($placeholders) GROUP BY session_id, type"
);
$stmt->execute($ids);
foreach ($stmt->fetchAll() as $r) {
    $sid = (int) $r['session_id'];
    if (!isset($moves[$sid])) {
        $moves[$sid] = ['in' => 0, 'out' => 0];
    }
    $moves[$sid][$r['type']] = (int) $r['total'];
}

$out = [];
foreach ($rows as $s) {
    $sid     = (int) $s['id'];
    $methods = $byMethod[$sid]['methods'] ?? array_fill_keys(byr_payment_methods(), 0);
    $count   = $byMethod[$sid]['count'] ?? 0;
    $cashIn  = $moves[$sid]['in']  ?? 0;
    $cashOut = $moves[$sid]['out'] ?? 0;
    $out[] = [
        'id'            => $sid,
        'openedAt'      => $s['opened_at'],
        'closedAt'      => $s['closed_at'],
        'openedBy'      => $s['opened_by_name'],
        'closedBy'      => $s['closed_by_name'],
        'openingFloat'  => (int) $s['opening_float'],
        'expectedCash'  => $s['expected_cash'] === null ? null : (int) $s['expected_cash'],
        'countedCash'   => $s['counted_cash'] === null ? null : (int) $s['counted_cash'],
        'difference'    => $s['difference'] === null ? null : (int) $s['difference'],
        'byMethod'      => $methods,
        'salesTotal'    => array_sum($methods),
        'paymentsCount' => $count,
        'cashIn'        => $cashIn,
        'cashOut'       => $cashOut,
    ];
}

json_out(['ready' => true, 'sessions' => $out]);
