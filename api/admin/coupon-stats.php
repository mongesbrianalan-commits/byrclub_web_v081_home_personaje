<?php
/**
 * Qué cuestan los cupones: cuántos se emiten, cuántos se canjean de
 * verdad y cuánta comida sale por la puerta sin cobrarse.
 *
 * El panel ya tenía estadísticas de pedidos (stats.php), pero contaban
 * plata que ENTRA. Los vales son plata que no entra, y no aparecían en
 * ningún lado: un pedido con "Cheese Burger gratis" se veía igual que
 * uno pago. Así es imposible saber si el sistema de puntos se está
 * yendo de las manos — que es exactamente la pregunta que hay que poder
 * contestar antes de tocar una probabilidad.
 *
 * Se cuentan dos cosas distintas a propósito:
 *
 *   EMITIDOS  — vales que los juegos repartieron. Es lo que el sistema
 *               promete. Muchos vencen sin usarse.
 *   CANJEADOS — vales que el cajero validó. Es lo que de verdad costó,
 *               y es el número que importa para la plata.
 *
 * La diferencia entre los dos es el margen que hay para ajustar: si se
 * emiten 100 y se canjean 30, bajar la emisión a la mitad no baja el
 * costo a la mitad.
 *
 * Respuesta: { ok, periods: { today, week, all }, emission, foodCostPct }
 *   cada período: { issued, redeemed, expired, pending, cost, foodCost,
 *                   orders: {total, withCoupon}, bySource: [], byPrize: [] }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../coupon-cost.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero']);

/* La columna de vencimiento es de una migración posterior. Sin ella no se
   puede separar "venció" de "todavía lo tiene", así que esa fila se omite
   en vez de romper el reporte entero. */
$hasExpiry = byr_coupon_expiry_ready($pdo);
$prices    = byr_coupon_prices($pdo);
$foodPct   = byr_coupon_food_cost_pct();

$today = byr_day_start_db(0);
$week  = byr_day_start_db(6); // hoy + los 6 anteriores

$periods = [];
foreach (['today' => $today, 'week' => $week, 'all' => null] as $key => $since) {
    $periods[$key] = byr_coupon_bucket($pdo, $prices, $foodPct, $hasExpiry, $since)
        + ['orders' => byr_coupon_orders($pdo, $since)];
}

json_out([
    'ok'          => true,
    'periods'     => $periods,
    'emission'    => byr_coupon_emission(),
    'foodCostPct' => $foodPct,
    'hasExpiry'   => $hasExpiry,
]);
