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
     * Cuántos PUNTOS cuesta cada peso de comida en el catálogo de
     * Beneficios. Con 0.5, una hamburguesa de $11.000 sale 5.500 puntos y
     * una Coca de $2.800 sale 1.400: mismo esfuerzo por peso de comida
     * para todos los premios.
     *
     * Los precios NO están escritos en ningún lado: se calculan desde la
     * carta, así que cuando subís el menú, los puntos suben solos. Subir
     * este número encarece TODO el catálogo de una — es la perilla para
     * mover si se siguen regalando demasiadas hamburguesas.
     *
     * Cambiarlo acá tiene efecto al instante, sin desplegar.
     */
    'perk_points_per_amount' => 0.5,

    /*
     * Aviso de precios en la página de Beneficios — texto de transición
     * para cuando los precios cambian, así el socio que venía juntando se
     * entera en vez de encontrarse con que el premio se le alejó.
     *
     * Se apaga solo el día que dice la fecha. Para sacarlo antes, poné la
     * fecha en '' y desaparece al instante. Los textos también se pueden
     * pisar acá si querés decirlo con otras palabras.
     */
    'perk_price_notice_until' => '2026-09-27',
    // 'perk_price_notice_title' => 'Cambiaron los precios de los premios',
    // 'perk_price_notice_body'  => 'Ahora cada premio cuesta según...',

    /*
     * Cuánto cuesta un cupón — para el bloque "Qué cuestan los cupones"
     * del panel (pestaña Pedidos).
     *
     * El PRECIO de cada premio sale solo del producto de la carta: la
     * "Cheese Burger gratis" vale lo que vale la Simple con Cheddar, y si
     * la subís en el panel de Menú, sube sola acá. No hay que tocar nada.
     *
     * Lo que el panel no puede adivinar es cuánto te cuesta HACERLA, que
     * depende de tus proveedores. Por eso muestra las dos cifras: el
     * precio de carta (lo que dejás de facturar) y una estimación de
     * mercadería con este porcentaje. 35% es un valor de arranque común
     * en gastronomía; cambialo cuando tengas el número tuyo.
     */
    'coupon_food_cost_pct' => 35,

    /*
     * Precio a mano de un premio suelto, solo si hace falta pisarlo.
     * Casi nunca se usa: sirve para los premios que no son un producto de
     * la carta, como el "Premio sorpresa" (que se estima con una porción
     * de papas). Si en la práctica das otra cosa, ponele su precio acá.
     *
     *   'coupon_costs' => ['surprise' => 5000],
     */
    'coupon_costs' => [],

    /*
     * Costo de envío del delivery, en pesos. Es fijo para toda la zona.
     * El retiro en el local no paga envío, y el envío NO suma puntos
     * (los puntos se calculan sobre la comida).
     * Cambiarlo acá NO altera los pedidos ya hechos: cada pedido guarda
     * cuánto se le cobró de envío.
     */
    'delivery_fee' => 490,

    /*
     * Horario en que se puede PEDIR POR LA WEB (hora de Argentina).
     *
     *   ['19:40', '23:30']  -> abierto de 19:40 a 23:30
     *   ['20:00', '01:30']  -> también vale cruzar la medianoche
     *   null                -> sin límite, se puede pedir siempre
     *
     * Fuera de ese rango la carta se sigue viendo, pero no deja enviar el
     * pedido. Cambiarlo acá tiene efecto al instante, sin desplegar nada.
     *
     * NO afecta al mostrador: el cajero vende cuando el local está abierto.
     */
    'order_hours' => ['19:40', '23:30'],

    /*
     * 2x1 de socio de los MIÉRCOLES: ¿se puede sumar a un pedido web?
     *
     * false (por defecto) = como siempre: el socio reclama el código y lo
     *                       muestra en el local.
     * true                = además aparece en la carta, los miércoles, como
     *                       "2x1 Doble Cheese con papas", y se puede sumar
     *                       al pedido (o pedir solo eso).
     *
     * Es una PRUEBA PILOTO: se prende y se apaga acá, sin desplegar nada.
     * Los dos caminos comparten el mismo límite de uno por socio por
     * miércoles, así que nadie puede usarlo dos veces.
     *
     * Necesita la migración 2026-08-perk-2x1-web.sql corrida.
     */
    'perk_2x1_web' => false,

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
