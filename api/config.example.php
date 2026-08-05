<?php
/**
 * BYR Club — Plantilla de configuración de la base de datos.
 *
 * PASOS:
 *  1. Copiá este archivo y renombralo como  config.php
 *  2. Completá los 4 valores con los datos que te da Hostinger
 *     al crear la base de datos MySQL.
 *  3. NO subas config.php a GitHub (ya está en .gitignore).
 *
 * En Hostinger el host casi siempre es "localhost".
 */

return [
    'db_host'    => 'localhost',
    'db_name'    => 'REEMPLAZAR_NOMBRE_DB',
    'db_user'    => 'REEMPLAZAR_USUARIO_DB',
    'db_pass'    => 'REEMPLAZAR_CONTRASENA_DB',
    'db_charset' => 'utf8mb4',

    /*
     * Prode — API-Football (api-sports.io). Registrate gratis en
     * https://www.api-football.com/ , copiá tu API key y pegala acá.
     * league 128 = Primera División Argentina. season = año de la temporada.
     */
    'apifootball_key'    => '',    // TU API KEY (dejar vacío desactiva el sync)
    'prode_league'       => 128,   // Primera División Argentina
    'prode_season'       => 2026,

    // Premio para el ganador de cada fecha del Prode (podés cambiarlo cuando quieras).
    'prode_prize'        => 'Hamburguesa gratis (Doble Cheese con papas)',
];
