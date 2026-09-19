<?php
/**
 * Catálogo autoritativo de la Ruleta diaria.
 *
 * Vivía dentro de spin.php, que era el único que lo necesitaba. Ahora el
 * panel también tiene que saber CADA CUÁNTO sale un cupón para poder
 * mostrar el costo del sistema, y copiar los pesos a otro archivo habría
 * creado una segunda fuente de verdad — el problema que ya arrastran
 * scratch y beneficios.html, avisado en sus propios comentarios.
 *
 * El orden del array importa: es el MISMO que el array `prizes` del
 * cliente (assets/games/roulette/roulette.js), porque el índice es lo que
 * se manda para animar la rueda.
 */

const BYR_WHEEL_PRIZES = [
    ['id' => 'points-50',     'label' => '50 puntos',         'icon' => '⭐', 'description' => 'Sumaste 50 puntos para seguir avanzando en BYR Club.',        'points' => 50,  'xp' => 25, 'redeemable' => false],
    ['id' => 'fries',         'label' => 'Papas gratis',      'icon' => '🍟', 'description' => 'Desbloqueaste una porción de papas para canjear en BYR.',       'points' => 0,   'xp' => 20, 'redeemable' => true],
    ['id' => 'points-100',    'label' => '100 puntos',        'icon' => '⭐', 'description' => 'Sumaste 100 puntos a tu progreso de BYR Club.',                'points' => 100, 'xp' => 35, 'redeemable' => false],
    ['id' => 'surprise',      'label' => 'Premio sorpresa',   'icon' => '🎁', 'description' => 'Ganaste una sorpresa especial. Mostrá el código en el local.',  'points' => 0,   'xp' => 25, 'redeemable' => true],
    ['id' => 'points-250',    'label' => '250 puntos',        'icon' => '🌟', 'description' => '¡Premio grande! Sumaste 250 puntos a tu perfil.',              'points' => 250, 'xp' => 50, 'redeemable' => false],
    ['id' => 'drink',         'label' => 'Bebida gratis',     'icon' => '🥤', 'description' => 'Desbloqueaste una bebida para tu próxima hamburguesa.',        'points' => 0,   'xp' => 20, 'redeemable' => true],
    ['id' => 'double-points', 'label' => '2x puntos',         'icon' => '🍔', 'description' => 'Tu próxima compra suma el doble de puntos. Mostrá el código.',  'points' => 0,   'xp' => 30, 'redeemable' => true],
    ['id' => 'badge',         'label' => 'Insignia exclusiva','icon' => '💎', 'description' => 'Desbloqueaste una insignia especial para tu perfil.',          'points' => 0,   'xp' => 40, 'redeemable' => false, 'achievement' => ['id' => 'roulette-exclusive-badge', 'label' => 'Insignia exclusiva', 'icon' => '💎']],
];

/* Cada entrada es un casillero de la rueda y apunta a un índice de
   BYR_WHEEL_PRIZES. Un premio repetido ocupa más casilleros, o sea que
   sale más seguido: 'points-50' (índice 0) va tres veces. */
const BYR_WHEEL_SLOTS = [0, 0, 0, 1, 2, 2, 2, 3, 4, 5, 6, 7];

/** Sortea un casillero. Devuelve [índice del premio, premio]. */
function byr_wheel_draw(): array
{
    $index = BYR_WHEEL_SLOTS[random_int(0, count(BYR_WHEEL_SLOTS) - 1)];

    return [$index, BYR_WHEEL_PRIZES[$index]];
}
