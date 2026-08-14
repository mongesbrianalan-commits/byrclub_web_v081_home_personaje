<?php
/**
 * Sondeo liviano: ¿entró algún pedido nuevo de un cliente?
 *
 * El panel llama esto cada pocos segundos para hacer sonar la campanita. Por
 * eso devuelve dos números y nada más: sacar la lista completa de pedidos cada
 * 20 segundos sería tirar consultas al pedo.
 *
 * Solo cuenta pedidos ONLINE: las ventas de mostrador las carga el propio
 * cajero, no tiene sentido avisarle de algo que acaba de hacer él.
 *
 * Respuesta: { ok, pending, lastId }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero', 'cocina']);

$where = "status = 'pending'";
if (byr_pos_ready($pdo)) {
    $where .= " AND (channel IS NULL OR channel <> 'mostrador')";
}

$row = $pdo->query(
    "SELECT COUNT(*) AS pending, COALESCE(MAX(id), 0) AS last_id FROM orders WHERE $where"
)->fetch();

json_out([
    'ok'      => true,
    'pending' => (int) ($row['pending'] ?? 0),
    'lastId'  => (int) ($row['last_id'] ?? 0),
]);
