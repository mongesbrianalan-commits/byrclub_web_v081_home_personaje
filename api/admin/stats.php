<?php
/**
 * Estadísticas de pedidos: cuántos por delivery, cuántos por retiro (take away)
 * y cuántos de mostrador, con lo facturado en cada caso.
 *
 * Se separan las ventas de MOSTRADOR de los retiros: las dos son "el cliente se
 * lo lleva", pero una la carga el cajero en el local y la otra la pidió el
 * cliente por la web. Mezclarlas haría que "take away" no signifique nada.
 *
 * Un pedido cargado en el mostrador PARA MANDAR cuenta como delivery, no como
 * mostrador: lo que separa los tres números es cómo sale la comida.
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

/* El delivery se pregunta PRIMERO, antes que el canal: una venta cargada en
   el mostrador que sale en moto es un delivery igual que la que se pidió por
   la web (sale una moto, se cobra el envío). "Mostrador" queda para lo que
   de verdad se lleva el cliente que está parado en el local. */
$kindExpr = $hasChannel
    ? "CASE WHEN o.fulfillment = 'delivery' THEN 'delivery'
            WHEN o.channel = 'mostrador' THEN 'mostrador'
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

/* Los cortes de día van en hora de Argentina, traducidos al reloj de la base.
   Con date() a secas el día cambiaba a las 21:00 de acá (el server está en
   UTC): el número de "Hoy" se reiniciaba en el medio del turno. */
$today = byr_day_start_db(0);
$week  = byr_day_start_db(6); // hoy + los 6 anteriores

json_out([
    'ok'      => true,
    'periods' => [
        'today' => byr_stats_bucket($pdo, $kindExpr, $totalExpr, $today),
        'week'  => byr_stats_bucket($pdo, $kindExpr, $totalExpr, $week),
        'all'   => byr_stats_bucket($pdo, $kindExpr, $totalExpr, null),
    ],
    'deliveryFee' => byr_delivery_fee(),
]);
