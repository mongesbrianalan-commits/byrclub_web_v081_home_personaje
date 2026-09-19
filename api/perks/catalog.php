<?php
/**
 * BYR Club — recompensas que se canjean con puntos (la pagina Beneficios).
 *
 * Es la fuente de verdad del PRECIO y del NIVEL requerido. Antes el canje
 * vivia entero en el navegador (beneficios.js): restaba los puntos en
 * local, decia "✓ ¡Canjeado!" y ahi terminaba. No quedaba nada en la base,
 * el admin no tenia que validar y el socio no tenia que mostrar. Un Cheese
 * Burger de 1.800 puntos se canjeaba contra la nada.
 *
 * --- El precio ya no se escribe a mano ---------------------------------
 *
 * Hasta ahora cada precio estaba anotado en tres lugares (acá, el
 * data-points de beneficios.html y el "1.800 pts" que se ve en la tarjeta)
 * y había que acordarse de tocar los tres. Además los números no tenían
 * relación entre sí: una Cheese Burger salía 1.800 puntos para $11.000 de
 * comida y una porción de papas 900 para $4.000, o sea que la hamburguesa
 * costaba 0,16 puntos por peso y las papas 0,23. La comida más cara era
 * la más barata de conseguir.
 *
 * Ahora el precio SE CALCULA: son los pesos que vale el producto en la
 * carta por BYR_PERK_POINTS_RATE puntos. Con 0,5, una hamburguesa de
 * $11.000 sale 5.500 puntos y una Coca de $2.800 sale 1.400. Mismo
 * esfuerzo por peso de comida para todos los premios, y si mañana sube el
 * menú, los puntos suben solos.
 *
 * Lo único que se escribe a mano es el NIVEL, el 'factor' de los premios
 * que valen más de lo que dice su precio (el Combo Toddy es el premio
 * máximo: vale el doble) y de qué producto sale cada uno.
 */
require_once __DIR__ . '/../helpers.php';

/**
 * Cuántos puntos cuesta cada peso de comida. Se cambia desde config.php
 * con 'perk_points_per_amount', sin desplegar.
 *
 * Subirlo encarece TODO el catálogo de una; es la perilla para mover si
 * se siguen regalando demasiadas hamburguesas.
 */
const BYR_PERK_POINTS_RATE = 0.5;

/* Los precios se redondean para que no queden números sucios: 10.750
   queda en 10.800. */
const BYR_PERK_POINTS_STEP = 100;

/**
 * El catálogo. 'product' es el slug del producto de la carta del que sale
 * el precio; 'factor' multiplica ese precio (1.0 salvo que se diga otra
 * cosa).
 */
const BYR_PERK_REWARDS = [
    'coca-cola'     => ['label' => 'Coca-Cola 500cc',       'product' => 'beb-coca',            'level' => 1, 'icon' => '🥤'],
    'papas'         => ['label' => 'Porción de papas BYR',  'product' => 'papas-individual',    'level' => 1, 'icon' => '🍟'],
    'cheese-burger' => ['label' => 'Cheese Burger',         'product' => 'simple-cheddar',      'level' => 1, 'icon' => '🍔'],
    'doble-cheese'  => ['label' => 'Doble Cheese Burger',   'product' => 'doble-cheddar',       'level' => 1, 'icon' => '🍔'],
    'cuarto-byr'    => ['label' => 'Cuarto de BYR',         'product' => 'cuarto-de-byr',       'level' => 1, 'icon' => '🍔'],
    'americana'     => ['label' => 'Americana',             'product' => 'americana',           'level' => 1, 'icon' => '🍔'],
    'cannons'       => ['label' => 'Cannons',               'product' => 'cannons',             'level' => 5, 'icon' => '🍔'],
    'la-triple'     => ['label' => 'La Triple',             'product' => 'la-triple',           'level' => 5, 'icon' => '🍔'],

    /* El premio máximo vale el doble de lo que dice la carta: es el
       objetivo largo del que vive toda la página, no una compra más. */
    'combo-triple'  => ['label' => 'Combo Toddy',           'product' => 'promo-triple-cheese', 'level' => 6, 'icon' => '👑', 'factor' => 2.0],

    /* La seccion destacada de arriba de todo apunta al mismo Combo Toddy. */
    'legendary'     => ['label' => 'Combo Toddy',           'product' => 'promo-triple-cheese', 'level' => 6, 'icon' => '👑', 'factor' => 2.0],
];

/**
 * Precio de respaldo, en puntos, por si el producto no está en la base
 * (una instalación sin la carta cargada, o un slug que alguien renombró).
 *
 * Sin esto un premio quedaría en 0 puntos y se podría canjear gratis, que
 * es exactamente el agujero que no queremos. Son los precios calculados
 * con la carta de septiembre de 2026.
 */
const BYR_PERK_FALLBACK_POINTS = [
    'coca-cola'     => 1400,
    'papas'         => 2000,
    'cheese-burger' => 5500,
    'doble-cheese'  => 8000,
    'cuarto-byr'    => 8300,
    'americana'     => 9000,
    'cannons'       => 9800,
    'la-triple'     => 10800,
    'combo-triple'  => 14000,
    'legendary'     => 14000,
];

/* --- Aviso de precios (transición) ---------------------------------
 *
 * Los precios subieron y cambiaron de criterio: antes eran números
 * sueltos, ahora salen de la carta. El socio que venía juntando para una
 * Cheese Burger pasó de necesitar 1.800 puntos a 5.500, y merece leer por
 * qué en vez de pensar que se rompió algo.
 *
 * Se apaga solo en BYR_PERK_NOTICE_UNTIL. Los cuatro valores se pisan
 * desde config.php ('perk_price_notice_until', '..._title', '..._body')
 * sin desplegar: poner la fecha en '' lo saca al instante.
 */
const BYR_PERK_NOTICE_UNTIL = '2026-09-27';

const BYR_PERK_NOTICE_TITLE = 'Cambiaron los precios de los premios';

const BYR_PERK_NOTICE_BODY  = 'Ahora cada premio cuesta según lo que vale en la carta, '
    . 'así que la comida más cara es la que más puntos pide. Los puntos que tenías '
    . 'siguen siendo tuyos: no se venció ni se perdió ninguno.';

/**
 * El catálogo con el precio ya calculado: mismo formato de siempre más
 * 'points', que es lo que cobra el canje y lo que muestra la página.
 *
 * Se consulta la carta una sola vez por request.
 */
function byr_perk_rewards(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $rate = (float) byr_setting('perk_points_per_amount', BYR_PERK_POINTS_RATE);
    if ($rate <= 0) {
        $rate = BYR_PERK_POINTS_RATE;
    }

    /* Precios de la carta, de una sola consulta. */
    $slugs = array_values(array_unique(array_column(BYR_PERK_REWARDS, 'product')));
    $menu  = [];
    if ($slugs) {
        try {
            $in   = implode(',', array_fill(0, count($slugs), '?'));
            $stmt = $pdo->prepare("SELECT slug, price FROM products WHERE slug IN ($in)");
            $stmt->execute($slugs);
            foreach ($stmt->fetchAll() as $row) {
                $menu[$row['slug']] = (int) $row['price'];
            }
        } catch (Throwable $e) {
            $menu = [];   /* sin carta: se usan los precios de respaldo */
        }
    }

    $out = [];
    foreach (BYR_PERK_REWARDS as $id => $reward) {
        $price  = $menu[$reward['product']] ?? null;
        $factor = (float) ($reward['factor'] ?? 1.0);

        if ($price !== null && $price > 0) {
            $points = (int) (round($price * $rate * $factor / BYR_PERK_POINTS_STEP) * BYR_PERK_POINTS_STEP);
        } else {
            $points = (int) (BYR_PERK_FALLBACK_POINTS[$id] ?? 0);
        }

        /* Un premio nunca sale menos que un escalón: si la cuenta diera 0
           (un producto a precio 0, por ejemplo) igual hay que pagarlo. */
        $out[$id] = $reward + [
            'points'    => max(BYR_PERK_POINTS_STEP, $points),
            'menuPrice' => $price,
        ];
    }

    return $cache = $out;
}
