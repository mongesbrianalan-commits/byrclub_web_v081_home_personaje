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

    /*
     * Pedidos online — cuántos pesos vale 1 punto. Con 100, una compra de
     * $8.000 sugiere 80 puntos. Es solo una SUGERENCIA: al confirmar el pedido
     * el admin ve el número y lo puede ajustar antes de acreditar.
     */
    'order_points_per_amount' => 100,

    /*
     * Costo de envío del delivery, en pesos. Es fijo para toda la zona.
     * El retiro en el local no paga envío, y el envío NO suma puntos
     * (los puntos se calculan sobre la comida).
     * Cambiarlo acá NO altera los pedidos ya hechos: cada pedido guarda
     * cuánto se le cobró de envío.
     */
    'delivery_fee' => 490,

    /*
     * Alias (o CBU) para las transferencias. Si el cliente elige "Transferencia"
     * al hacer el pedido, se le muestra esto para que sepa a dónde mandar la
     * plata.
     *
     * Si no se pone acá, se usa el que está por defecto en api/menu.php
     * (BYRDOCKSUD.MP). Poner un valor acá lo pisa, sin tocar código.
     *
     * OJO: esto NO cobra online. El cliente transfiere por su cuenta; el cobro
     * se registra en la caja igual que siempre, cuando el staff acepta el pedido.
     */
    'transfer_alias' => 'BYRDOCKSUD.MP',

    /*
     * Impresión térmica (comandas y tickets).
     *
     * 'print_token' es la contraseña que comparte el agente que corre en la PC
     * del local (tools/print-agent/) para venir a buscar los trabajos. Poné una
     * cadena larga y al azar, y la MISMA en la configuración del agente.
     * Vacío = la impresión por cola queda apagada.
     */
    'print_token' => '',

    /*
     * Qué se imprime solo al cobrar una venta o aceptar un pedido.
     * Con una sola impresora conviene dejar solo la comanda (el ticket del
     * cliente queda a un botón en el panel). Con dos: ['comanda', 'ticket'].
     */
    'print_auto' => ['comanda'],

    /*
     * A qué estación va cada cosa. Con una sola impresora, dejar las dos en
     * 'cocina' (que es el nombre de estación que usa el agente por defecto).
     */
    'print_station_comanda' => 'cocina',
    'print_station_ticket'  => 'cocina',
];
