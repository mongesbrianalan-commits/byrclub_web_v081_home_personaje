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
 * Los precios y niveles salen de beneficios.html (data-points / data-level).
 * Si cambia un precio hay que tocar los dos lados: el HTML lo muestra, este
 * archivo lo cobra.
 */

const BYR_PERK_REWARDS = [
    'coca-cola'     => ['label' => 'Coca-Cola 500cc',       'points' => 500,  'level' => 1, 'icon' => '🥤'],
    'papas'         => ['label' => 'Porción de papas BYR',  'points' => 900,  'level' => 1, 'icon' => '🍟'],
    'cheese-burger' => ['label' => 'Cheese Burger',         'points' => 1800, 'level' => 1, 'icon' => '🍔'],
    'doble-cheese'  => ['label' => 'Doble Cheese Burger',   'points' => 2500, 'level' => 1, 'icon' => '🍔'],
    'cuarto-byr'    => ['label' => 'Cuarto de BYR',         'points' => 3000, 'level' => 1, 'icon' => '🍔'],
    'americana'     => ['label' => 'Americana',             'points' => 3800, 'level' => 1, 'icon' => '🍔'],
    'cannons'       => ['label' => 'Cannons',               'points' => 4500, 'level' => 5, 'icon' => '🍔'],
    'la-triple'     => ['label' => 'La Triple',             'points' => 5200, 'level' => 5, 'icon' => '🍔'],
    'combo-triple'  => ['label' => 'Combo Toddy',           'points' => 8000, 'level' => 6, 'icon' => '👑'],

    /* La seccion destacada de arriba de todo apunta al mismo Combo Toddy. */
    'legendary'     => ['label' => 'Combo Toddy',           'points' => 8000, 'level' => 6, 'icon' => '👑'],
];
