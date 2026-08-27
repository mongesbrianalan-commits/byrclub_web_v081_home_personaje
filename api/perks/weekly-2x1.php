<?php
/**
 * Cupón 2x1 de socio de los MIÉRCOLES — camino "reclamar el código".
 *   GET  -> estado del beneficio hoy: { isWednesday, claimed, code, status }
 *   POST -> activa el 2x1 de hoy (idempotente) y devuelve el código.
 *
 * El socio activa el beneficio, se lleva el código y lo muestra en el local,
 * donde el cajero lo valida como cualquier otro vale.
 *
 * Las reglas (el día en hora de Argentina, el límite de uno por miércoles)
 * viven en 2x1.php, compartidas con el camino nuevo de pedir el 2x1 desde la
 * web. El límite es el mismo para los dos: quien lo pidió por la web no puede
 * además reclamar el código acá, y al revés.
 *
 * No necesita cambios en la base: reusa la tabla `redemptions`.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/2x1.php';

$id  = require_auth();
$pdo = db();

$isWednesday = byr_2x1_is_wednesday();
$method      = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $existing = byr_2x1_today($pdo, $id);

    json_out([
        'isWednesday' => $isWednesday,
        'claimed'     => (bool) $existing,
        'code'        => $existing['code'] ?? null,
        'status'      => $existing['status'] ?? null,
    ]);
}

if ($method === 'POST') {
    if (!$isWednesday) {
        json_out(['error' => 'El 2x1 de socio es solo los miércoles.', 'code' => 'not-wednesday'], 422);
    }

    $existing = byr_2x1_today($pdo, $id);
    if ($existing) {
        /* Ya lo usó hoy. Si fue por la web, el vale está 'redeemed' y no hay
           código que mostrar en el local: se lo decimos. */
        if (($existing['status'] ?? null) === 'redeemed') {
            json_out([
                'error' => 'Ya usaste tu 2x1 de hoy en un pedido web.',
                'code'  => 'already-used',
            ], 409);
        }

        json_out(['ok' => true, 'claimed' => true, 'reused' => true, 'code' => $existing['code']]);
    }

    $code = byr_generate_redemption_code($pdo);

    /* Las fechas las pone la BASE con NOW(), como todos los demás vales.
       Antes se le pasaba la hora de Argentina calculada en PHP, y eso dejaba
       este vale con un reloj distinto al del resto de la tabla: como el
       vencimiento se compara contra NOW() (UTC), el 2x1 se moría a las 21
       horas en vez de a las 24. Dentro de un mismo INSERT, MySQL garantiza
       que los dos NOW() valen igual. */
    $ins = $pdo->prepare(
        'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, "pending", NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))'
    );
    $ins->execute([
        $id, $code, BYR_2X1_PRIZE_ID, BYR_2X1_LABEL, BYR_2X1_SOURCE,
        BYR_REDEMPTION_TTL_HOURS,
    ]);

    json_out(['ok' => true, 'claimed' => true, 'reused' => false, 'code' => $code]);
}

json_out(['error' => 'Método no permitido.'], 405);
