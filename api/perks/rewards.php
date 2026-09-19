<?php
/**
 * La lista de precios del catálogo de Beneficios, para que la página la
 * dibuje en vez de tenerla escrita.
 *
 * Antes cada precio estaba anotado en el HTML — en el data-points, en el
 * "1.800 pts" de la tarjeta y en el texto del botón — además de en el
 * servidor, que es el que cobra. Cuatro lugares para un solo número: el
 * día que se cambiaba uno y se olvidaba otro, el socio veía un precio y
 * se le cobraba otro.
 *
 * Ahora manda el servidor y la página pregunta. Es público a propósito:
 * son los precios de la vidriera, no datos de nadie.
 *
 * Va también el AVISO de precios, que es texto de transición: cuando los
 * precios cambian, el socio que venía juntando para un premio se merece
 * enterarse en vez de encontrarse con que se le alejó. Tiene fecha de
 * vencimiento para que se apague solo y no quede colgado para siempre.
 *
 * Respuesta: { ok, rewards: [ {id, label, points, level, icon} ], notice }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/catalog.php';

$pdo = db();

$rewards = [];
foreach (byr_perk_rewards($pdo) as $id => $reward) {
    $rewards[] = [
        'id'     => $id,
        'label'  => $reward['label'],
        'points' => (int) $reward['points'],
        'level'  => (int) $reward['level'],
        'icon'   => $reward['icon'],
    ];
}

/* --- Aviso de precios ---------------------------------------------
   Se apaga solo el día que dice 'perk_price_notice_until'. Para
   cortarlo antes, o para estirarlo, se cambia esa fecha en config.php
   (o se pone '' para que no se muestre nunca). Sin desplegar nada. */
$notice = null;
$until  = (string) byr_setting('perk_price_notice_until', BYR_PERK_NOTICE_UNTIL);

if ($until !== '' && date('Y-m-d') <= $until) {
    $notice = [
        'title' => byr_setting('perk_price_notice_title', BYR_PERK_NOTICE_TITLE),
        'body'  => byr_setting('perk_price_notice_body',  BYR_PERK_NOTICE_BODY),
    ];
}

json_out([
    'ok'      => true,
    'rewards' => $rewards,
    'notice'  => $notice,
]);
