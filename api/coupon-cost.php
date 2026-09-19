<?php
/**
 * BYR Club — cuánto cuesta cada cupón y cada cuánto se emite.
 *
 * Los vales se repartían sin que nadie llevara la cuenta de lo que valen:
 * el panel sabía cuántos pedidos entraron y cuánto se facturó, pero un
 * pedido que llega con "Cheese Burger gratis" figuraba igual que
 * cualquier otro. La comida salía por la puerta sin dejar número.
 *
 * Este archivo pone los dos datos que faltaban:
 *
 *   1. PRECIO — qué vale el premio que se regala. Sale del producto real
 *      de la carta, así que si mañana sube la hamburguesa, sube sola acá
 *      también. No hay una lista de precios paralela que se desactualice.
 *
 *   2. EMISIÓN — cada cuánto sale ese premio en los juegos, leído de los
 *      catálogos que de verdad sortean (scratch/catalog.php y
 *      roulette/catalog.php). Es la probabilidad que está corriendo en
 *      producción ahora mismo, no una que alguien anotó.
 *
 * Lo que el reporte NO puede adivinar es el costo de la mercadería, que
 * depende de la lista de proveedores. Por eso el panel muestra las dos
 * cifras: el precio de carta (lo que se deja de facturar) y una
 * estimación de comida con el porcentaje de 'coupon_food_cost_pct'.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/scratch/catalog.php';
require_once __DIR__ . '/roulette/catalog.php';
require_once __DIR__ . '/perks/catalog.php';

/**
 * Qué producto de la carta representa cada premio que NO sale del
 * catálogo de Beneficios.
 *
 * Los premios de Beneficios (Cheese Burger, Combo Toddy, papas, bebida…)
 * ya dicen de qué producto salen en perks/catalog.php, porque de ahí sacan
 * su precio en puntos. Repetirlos acá sería una segunda lista para
 * mantener, así que byr_coupon_product_map() los toma de allá y esta
 * constante se queda solo con lo que el catálogo no cubre: lo que reparten
 * los juegos y los beneficios de socio.
 */
const BYR_COUPON_PRODUCT = [
    /* Juegos (ruleta y raspadita) */
    'fries'           => 'papas-individual',
    'drink'           => 'beb-coca',
    'cheese-burger'   => 'simple-cheddar',

    /* Beneficios de socio. El 2x1 regala una de las dos: cuesta una. */
    '2x1-wed'         => 'doble-cheddar',
    '2x1-wed-web'     => 'doble-cheddar',
    'birthday-burger' => 'doble-cheddar',
];

/**
 * Premios que no son un producto de la carta.
 *
 * 'surprise' es lo que el local decida dar en el momento, así que se
 * estima con el precio de una porción de papas y se ajusta desde
 * config.php ('coupon_costs') si en la práctica se da otra cosa.
 *
 * 'double-points' no saca comida por la puerta: duplica los puntos de
 * una compra. Cuesta puntos, no plata, y los puntos ya se cuentan por su
 * lado. Vale $0 en este reporte a propósito.
 */
const BYR_COUPON_FALLBACK = [
    'surprise'      => 'papas-individual',
    'double-points' => null,
];

/**
 * Premio → producto de la carta, para TODOS los premios: los de los
 * juegos (la constante de arriba) más los del catálogo de Beneficios, que
 * declaran su propio producto porque de ahí sacan su precio en puntos.
 *
 * Los de los juegos van primero y los de Beneficios después, así que un
 * id que esté en los dos (la Cheese Burger sale de la raspadita y también
 * se canjea con puntos) se resuelve al mismo producto por los dos lados.
 */
function byr_coupon_product_map(): array
{
    $out = BYR_COUPON_PRODUCT;
    foreach (BYR_PERK_REWARDS as $prizeId => $reward) {
        if (!empty($reward['product'])) {
            $out[$prizeId] = $reward['product'];
        }
    }

    return $out;
}

/**
 * Precio (ARS) de cada premio conocido, indexado por prize_id.
 *
 * El orden de prioridad es: lo que diga config.php manda, después el
 * precio del producto real, y si el premio no tiene producto, queda en
 * null — que el panel muestra como "sin precio" en vez de fingir un 0.
 */
function byr_coupon_prices(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $map   = byr_coupon_product_map();
    $slugs = array_values(array_unique(array_merge(
        array_values($map),
        array_filter(array_values(BYR_COUPON_FALLBACK))
    )));

    $prices = [];
    if ($slugs) {
        $in   = implode(',', array_fill(0, count($slugs), '?'));
        $stmt = $pdo->prepare("SELECT slug, price FROM products WHERE slug IN ($in)");
        $stmt->execute($slugs);
        foreach ($stmt->fetchAll() as $row) {
            $prices[$row['slug']] = (int) $row['price'];
        }
    }

    $out = [];
    foreach ($map as $prizeId => $slug) {
        $out[$prizeId] = $prices[$slug] ?? null;
    }
    foreach (BYR_COUPON_FALLBACK as $prizeId => $slug) {
        $out[$prizeId] = $slug === null ? 0 : ($prices[$slug] ?? null);
    }

    /* Override manual: 'coupon_costs' => ['surprise' => 5000, ...] */
    $manual = byr_setting('coupon_costs', []);
    if (is_array($manual)) {
        foreach ($manual as $prizeId => $value) {
            $out[(string) $prizeId] = max(0, (int) $value);
        }
    }

    return $cache = $out;
}

/**
 * ¿Está corrida la migración del vencimiento (2026-08-coupon-expiry.sql)?
 * Sin esa columna no se puede distinguir un vale vencido de uno que el
 * socio todavía tiene guardado, así que el reporte omite ese dato en vez
 * de inventarlo.
 */
function byr_coupon_expiry_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM redemptions LIKE 'expires_at'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/** Precio de un premio, o null si no está mapeado. */
function byr_coupon_price(PDO $pdo, string $prizeId): ?int
{
    return byr_coupon_prices($pdo)[$prizeId] ?? null;
}

/**
 * Qué porcentaje del precio de carta es mercadería. Sirve para estimar
 * el costo real de lo que se regala: una hamburguesa de $16.000 no
 * cuesta $16.000, cuesta lo que cuesta hacerla.
 *
 * 35% es un valor de arranque razonable en gastronomía; se corrige en
 * config.php con 'coupon_food_cost_pct' una vez que haya números propios.
 */
function byr_coupon_food_cost_pct(): int
{
    $pct = (int) byr_setting('coupon_food_cost_pct', 35);

    return max(1, min(100, $pct));
}

/**
 * Cada cuánto sale cada premio en los juegos diarios.
 *
 * Se lee de los mismos catálogos que sortean de verdad, así que el
 * número del panel no puede quedar desfasado del juego. Devuelve, por
 * juego, la probabilidad de cada premio y qué parte del total son
 * cupones (lo que se traduce en comida).
 */
function byr_coupon_emission(): array
{
    /* Raspadita: cada premio pesa lo suyo sobre el total. */
    $scratchTotal = 0;
    foreach (BYR_SCRATCH_PRIZES as $p) {
        $scratchTotal += (int) $p['weight'];
    }

    $scratch = ['coupon_rate' => 0.0, 'prizes' => []];
    foreach (BYR_SCRATCH_PRIZES as $p) {
        $rate = $scratchTotal > 0 ? ((int) $p['weight']) / $scratchTotal : 0.0;

        $scratch['prizes'][] = [
            'id'         => $p['id'],
            'label'      => $p['label'],
            'rate'       => $rate,
            'redeemable' => (bool) $p['redeemable'],
        ];
        if (!empty($p['redeemable'])) {
            $scratch['coupon_rate'] += $rate;
        }
    }

    /* Ruleta: cada premio ocupa tantos casilleros de la rueda. */
    $slots = [];
    foreach (BYR_WHEEL_SLOTS as $index) {
        $slots[$index] = ($slots[$index] ?? 0) + 1;
    }
    $wheelTotal = count(BYR_WHEEL_SLOTS);

    $wheel = ['coupon_rate' => 0.0, 'prizes' => []];
    foreach (BYR_WHEEL_PRIZES as $index => $p) {
        $rate = $wheelTotal > 0 ? ($slots[$index] ?? 0) / $wheelTotal : 0.0;

        $wheel['prizes'][] = [
            'id'         => $p['id'],
            'label'      => $p['label'],
            'rate'       => $rate,
            'redeemable' => (bool) $p['redeemable'],
        ];
        if (!empty($p['redeemable'])) {
            $wheel['coupon_rate'] += $rate;
        }
    }

    return [
        'scratch' => $scratch,
        'wheel'   => $wheel,

        /* Cuántos cupones genera por día un socio que juega a todo. Es el
           número que explica el volumen: con 0,7 son casi 5 por semana. */
        'per_active_day' => $scratch['coupon_rate'] + $wheel['coupon_rate'],
    ];
}

/**
 * Los números de un período. $since = null significa "desde siempre".
 *
 * Ojo con el criterio de fecha: los emitidos se cuentan por created_at y
 * los canjeados por redeemed_at. Un vale de ayer que se usó hoy le suma
 * costo a HOY, que es el día en que salió la comida.
 */
function byr_coupon_bucket(PDO $pdo, array $prices, int $foodPct, bool $hasExpiry, ?string $since): array
{
    /* Una sola pasada por premio: de ahí salen los totales, el corte por
       premio y (sumando) el corte por origen. */
    $where  = '1=1';
    $params = [];
    if ($since !== null) {
        /* Emitidos O canjeados en el período: las dos puntas interesan. */
        $where    = '(created_at >= ? OR redeemed_at >= ?)';
        $params[] = $since;
        $params[] = $since;
    }

    $issuedIn   = $since === null ? '1' : 'created_at >= ?';
    $redeemedIn = $since === null ? '1' : 'redeemed_at >= ?';

    $sel = [];
    if ($since !== null) {
        $sel[] = $since;   // issued
        $sel[] = $since;   // redeemed
        $sel[] = $since;   // expired (created_at)
    }

    /* Vencidos: emitidos en el período que siguen 'pending' y ya pasaron su
       fecha. Sin la columna de vencimiento no hay forma de saberlo, así que
       queda en 0 y el panel esconde la fila. */
    $expiredScoped = $hasExpiry
        ? ($since === null
            ? "SUM(status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW())"
            : "SUM(status = 'pending' AND created_at >= ? AND expires_at IS NOT NULL AND expires_at <= NOW())")
        : ($since === null ? '0' : 'SUM(0 AND created_at >= ?)');

    $stmt = $pdo->prepare(
        "SELECT prize_id, prize_label, source,
                SUM($issuedIn)          AS issued,
                SUM($redeemedIn AND status = 'redeemed') AS redeemed,
                $expiredScoped          AS expired
           FROM redemptions
          WHERE $where
          GROUP BY prize_id, prize_label, source"
    );
    $stmt->execute(array_merge($sel, $params));

    $totals  = ['issued' => 0, 'redeemed' => 0, 'expired' => 0, 'cost' => 0, 'unpriced' => 0];
    $byPrize = [];
    $bySource = [];

    foreach ($stmt->fetchAll() as $row) {
        $prizeId  = (string) $row['prize_id'];
        $issued   = (int) $row['issued'];
        $redeemed = (int) $row['redeemed'];
        $expired  = (int) $row['expired'];
        $price    = $prices[$prizeId] ?? null;
        $cost     = $price === null ? 0 : $price * $redeemed;

        $totals['issued']   += $issued;
        $totals['redeemed'] += $redeemed;
        $totals['expired']  += $expired;
        $totals['cost']     += $cost;
        if ($price === null && $redeemed > 0) {
            $totals['unpriced'] += $redeemed;
        }

        if (!isset($byPrize[$prizeId])) {
            $byPrize[$prizeId] = [
                'id'       => $prizeId,
                'label'    => (string) $row['prize_label'],
                'issued'   => 0,
                'redeemed' => 0,
                'price'    => $price,
                'cost'     => 0,
            ];
        }
        $byPrize[$prizeId]['issued']   += $issued;
        $byPrize[$prizeId]['redeemed'] += $redeemed;
        $byPrize[$prizeId]['cost']     += $cost;

        $source = (string) $row['source'];
        if (!isset($bySource[$source])) {
            $bySource[$source] = ['source' => $source, 'issued' => 0, 'redeemed' => 0, 'cost' => 0];
        }
        $bySource[$source]['issued']   += $issued;
        $bySource[$source]['redeemed'] += $redeemed;
        $bySource[$source]['cost']     += $cost;
    }

    /* Lo más caro primero: es lo que hay que mirar. */
    $byPrize  = array_values($byPrize);
    $bySource = array_values($bySource);
    usort($byPrize,  fn($a, $b) => $b['cost'] <=> $a['cost'] ?: $b['redeemed'] <=> $a['redeemed']);
    usort($bySource, fn($a, $b) => $b['cost'] <=> $a['cost'] ?: $b['redeemed'] <=> $a['redeemed']);

    return [
        'issued'   => $totals['issued'],
        'redeemed' => $totals['redeemed'],
        'expired'  => $totals['expired'],
        'cost'     => $totals['cost'],
        'foodCost' => (int) round($totals['cost'] * $foodPct / 100),
        'unpriced' => $totals['unpriced'],
        'byPrize'  => $byPrize,
        'bySource' => $bySource,
    ];
}

/**
 * Qué parte de los pedidos llegó con un cupón adjunto. Es el número que
 * se siente en el mostrador ("uno de cada cinco viene con cupón").
 *
 * Solo mira los pedidos web: el mostrador no adjunta cupones, los valida
 * a mano. Los cancelados no cuentan, igual que en stats.php.
 */
function byr_coupon_orders(PDO $pdo, ?string $since): array
{
    $where  = "status <> 'cancelled'";
    $params = [];
    if ($since !== null) {
        $where   .= ' AND created_at >= ?';
        $params[] = $since;
    }

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS total, SUM(coupon_code IS NOT NULL) AS with_coupon
           FROM orders
          WHERE $where"
    );
    $stmt->execute($params);
    $row = $stmt->fetch() ?: [];

    return [
        'total'      => (int) ($row['total'] ?? 0),
        'withCoupon' => (int) ($row['with_coupon'] ?? 0),
    ];
}
