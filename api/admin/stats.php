<?php
/**
 * Estadísticas de pedidos: cuántos por delivery, cuántos por retiro (take away)
 * y cuántos de mostrador, con lo facturado en cada caso.
 *
 * Se separan las ventas de MOSTRADOR de los retiros: las dos son "el cliente se
 * lo lleva", pero una la carga el cajero en el local y la otra la pidió el
 * cliente por la web. Mezclarlas haría que "take away" no signifique nada.
 *
 * Los pedidos cancelados no cuentan.
 *
 * Respuesta: { ok, periods: { today, week, all }, deliveryFee }
 *   cada período: { delivery: {n, total}, pickup: {...}, mostrador: {...} }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../caja.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero']);

/* Las dos columnas son de migraciones posteriores: si no están, se reemplazan
   por constantes para que la consulta siga siendo válida. */
$hasChannel  = byr_pos_ready($pdo);
$hasShipping = byr_shipping_ready($pdo);

$kindExpr = $hasChannel
    ? "CASE WHEN o.channel = 'mostrador' THEN 'mostrador'
            WHEN o.fulfillment = 'delivery' THEN 'delivery'
            ELSE 'pickup' END"
    : "CASE WHEN o.fulfillment = 'delivery' THEN 'delivery' ELSE 'pickup' END";

$totalExpr = $hasShipping ? '(o.items_total + o.shipping_cost)' : 'o.items_total';

/**
 * Cuenta los pedidos agrupados por tipo desde una fecha en adelante.
 * $since = null significa "desde siempre".
 */
function byr_stats_bucket(PDO $pdo, string $kindExpr, string $totalExpr, ?string $since): array
{
    $out = [
        'delivery'  => ['n' => 0, 'total' => 0],
        'pickup'    => ['n' => 0, 'total' => 0],
        'mostrador' => ['n' => 0, 'total' => 0],
    ];

    $where  = "o.status <> 'cancelled'";
    $params = [];
    if ($since !== null) {
        $where .= ' AND o.created_at >= ?';
        $params[] = $since;
    }

    $stmt = $pdo->prepare(
        "SELECT $kindExpr AS kind, COUNT(*) AS n, COALESCE(SUM($totalExpr), 0) AS total
           FROM orders o
          WHERE $where
          GROUP BY kind"
    );
    $stmt->execute($params);

    foreach ($stmt->fetchAll() as $row) {
        $k = $row['kind'];
        if (isset($out[$k])) {
            $out[$k] = ['n' => (int) $row['n'], 'total' => (int) $row['total']];
        }
    }
    return $out;
}

$today = date('Y-m-d 00:00:00');
$week  = date('Y-m-d 00:00:00', strtotime('-6 days')); // hoy + los 6 anteriores

json_out([
    'ok'      => true,
    'periods' => [
        'today' => byr_stats_bucket($pdo, $kindExpr, $totalExpr, $today),
        'week'  => byr_stats_bucket($pdo, $kindExpr, $totalExpr, $week),
        'all'   => byr_stats_bucket($pdo, $kindExpr, $totalExpr, null),
    ],
    'deliveryFee' => byr_delivery_fee(),
]);
