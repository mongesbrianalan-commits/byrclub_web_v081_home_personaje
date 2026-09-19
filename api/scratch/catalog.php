<?php
/**
 * Catálogo autoritativo de la Raspadita diaria.
 *
 * Es la MISMA tabla que tenía el array `scratchPrizes` de scratch.js, pero
 * acá manda el servidor: el navegador ya no sortea nada, solo dibuja lo que
 * se le dice. Los puntos/XP salen de assets/core/prizes.js (BYRPrizeRegistry)
 * y están replicados acá porque el cliente no es fuente de verdad.
 *
 * Si se cambia un premio, hay que tocar los tres lugares:
 *   - este archivo (lo que se otorga de verdad)
 *   - assets/core/prizes.js (lo que el perfil muestra del inventario)
 *   - assets/games/scratch/scratch.js (nada: ya no tiene catálogo propio)
 */

/* weight = peso relativo del sorteo. Suman 105.
 *
 * La Cheese Burger gratis pesaba 5 — una hamburguesa entera regalada
 * cada 21 raspaditas, por cara, sin gastar un solo punto. Con los socios
 * jugando todos los días eso solo alcanzaba para explicar una parte de
 * los pedidos con cupón, y era la parte MÁS CARA: las papas y la bebida
 * cuestan $4.000 y $2.800, la hamburguesa $11.000.
 *
 * Ahora pesa 1 (una cada 105). El golpe de suerte sigue existiendo —que
 * es lo que engancha— pero cuesta cinco veces menos. Los 4 puntos de
 * peso que se le sacaron NO se repartieron entre los otros cupones:
 * fueron a '50 puntos', así que la probabilidad de papas, bebida y
 * sorpresa quedó igual que antes y el total sigue sumando 105. Lo único
 * que cambió es que donde antes salía una hamburguesa, ahora salen
 * puntos.
 */
const BYR_SCRATCH_PRIZES = [
    ['id' => 'points-50',     'label' => '50 puntos',           'icon' => '⭐', 'points' => 50,  'xp' => 25, 'weight' => 36, 'redeemable' => false],
    ['id' => 'points-100',    'label' => '100 puntos',          'icon' => '💯', 'points' => 100, 'xp' => 35, 'weight' => 23, 'redeemable' => false],
    ['id' => 'points-250',    'label' => '250 puntos',          'icon' => '🏆', 'points' => 250, 'xp' => 50, 'weight' => 8,  'redeemable' => false],
    ['id' => 'fries',         'label' => 'Papas gratis',        'icon' => '🍟', 'points' => 0,   'xp' => 20, 'weight' => 15, 'redeemable' => true],
    ['id' => 'drink',         'label' => 'Bebida gratis',       'icon' => '🥤', 'points' => 0,   'xp' => 20, 'weight' => 14, 'redeemable' => true],
    ['id' => 'surprise',      'label' => 'Premio sorpresa',     'icon' => '🎁', 'points' => 0,   'xp' => 25, 'weight' => 6,  'redeemable' => true],
    ['id' => 'cheese-burger', 'label' => 'Cheese Burger gratis','icon' => '🧀', 'points' => 0,   'xp' => 35, 'weight' => 1,  'redeemable' => true],
    ['id' => 'badge',         'label' => 'Insignia exclusiva',  'icon' => '💎', 'points' => 0,   'xp' => 40, 'weight' => 2,  'redeemable' => false,
     'achievement' => ['id' => 'roulette-exclusive-badge', 'label' => 'Insignia exclusiva', 'icon' => '💎']],
];

/** Sortea un premio respetando los pesos. */
function byr_scratch_draw(): array
{
    $total = 0;
    foreach (BYR_SCRATCH_PRIZES as $p) {
        $total += (int) $p['weight'];
    }

    $roll = random_int(1, $total);
    foreach (BYR_SCRATCH_PRIZES as $p) {
        $roll -= (int) $p['weight'];
        if ($roll <= 0) {
            return $p;
        }
    }

    return BYR_SCRATCH_PRIZES[0];
}

/** Lo que se le manda al navegador para dibujar el cartón (sin pesos). */
function byr_scratch_public(array $prize, ?string $code = null): array
{
    return [
        'id'         => $prize['id'],
        'label'      => $prize['label'],
        'icon'       => $prize['icon'],
        'points'     => (int) $prize['points'],
        'xp'         => (int) $prize['xp'],
        'redeemable' => (bool) $prize['redeemable'],
        'code'       => $code,
    ];
}
