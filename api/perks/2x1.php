<?php
/**
 * Reglas del 2x1 de socio de los MIÉRCOLES, compartidas por los dos caminos:
 *
 *   1. Reclamar el código y mostrarlo en el local  (api/perks/weekly-2x1.php)
 *   2. Sumarlo a un pedido web                     (api/menu.php + api/orders/create.php)
 *
 * El límite es UNO POR SOCIO POR MIÉRCOLES y vale para los dos caminos a la
 * vez: quien lo pidió por la web no puede además reclamar el código, y al
 * revés. El control vive en la tabla `redemptions`, que es la misma que usan
 * todos los vales.
 *
 * El día se calcula SIEMPRE en hora de Argentina, no en la del servidor: así
 * el beneficio está disponible todo el miércoles local, incluida la noche
 * —que es cuando más se vende— sin importar el huso del hosting (que suele
 * estar en UTC).
 */
require_once __DIR__ . '/../helpers.php';

const BYR_2X1_LABEL  = '2x1 Doble Cheese con papas';
const BYR_2X1_SOURCE = 'Miércoles de socio';

/* Dos prize_id distintos según cómo lo haya usado, para que el cajero pueda
   distinguirlo de un vistazo. El `source` es el mismo en los dos, que es lo
   que hace que compartan el límite de uno por miércoles. */
const BYR_2X1_PRIZE_ID     = '2x1-wed';      // reclamó el código, lo muestra en el local
const BYR_2X1_PRIZE_ID_WEB = '2x1-wed-web';  // lo pidió por la web, ya se consumió

/* El producto que representa el 2x1 en la carta. Vive en `products` con
   available = 0, así que NUNCA sale en el menú normal: lo agrega a mano
   api/menu.php cuando corresponde, y api/orders/create.php lo acepta sólo
   si vuelve a comprobar las condiciones. */
const BYR_2X1_PRODUCT_SLUG = 'promo-2x1-doble-cheese';

/** Ahora, en hora de Argentina. */
function byr_2x1_now(): DateTime
{
    return new DateTime('now', new DateTimeZone('America/Argentina/Buenos_Aires'));
}

/** ¿Hoy es miércoles (en Argentina)? */
function byr_2x1_is_wednesday(): bool
{
    return ((int) byr_2x1_now()->format('N') === 3); // 3 = miércoles
}

/**
 * Límites del día de hoy en hora de Argentina. Como los vales del 2x1 se
 * guardan con created_at en hora local, comparar contra estos límites es
 * correcto sin importar el huso del servidor.
 */
function byr_2x1_day_bounds(): array
{
    $now = byr_2x1_now();

    return [
        (clone $now)->setTime(0, 0, 0)->format('Y-m-d H:i:s'),
        (clone $now)->modify('+1 day')->setTime(0, 0, 0)->format('Y-m-d H:i:s'),
    ];
}

/**
 * El 2x1 que el socio ya usó hoy, por cualquiera de los dos caminos.
 * Devuelve null si todavía no lo usó.
 */
function byr_2x1_today(PDO $pdo, int $userId): ?array
{
    [$dayStart, $dayEnd] = byr_2x1_day_bounds();

    $stmt = $pdo->prepare(
        'SELECT id, code, status, prize_id, prize_label, created_at, redeemed_at
           FROM redemptions
          WHERE user_id = ? AND source = ? AND created_at >= ? AND created_at < ?
          ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([$userId, BYR_2X1_SOURCE, $dayStart, $dayEnd]);
    $row = $stmt->fetch();

    return $row ?: null;
}

/**
 * El 2x1 de este socio HOY, contado para el cajero.
 *
 * Es lo que hay que mirar cuando alguien llega al local y lo pide: dice si
 * ya lo usó, cómo y cuándo. Sin esto, el cajero no tiene forma de saber que
 * el cliente ya lo pidió por la web hace media hora.
 *
 *   isWednesday  hoy es miércoles en Argentina
 *   used         ya lo usó hoy, por cualquiera de los dos caminos
 *   via          'web' | 'codigo' | null
 *   status       'pending' (reclamado, sin usar en el local) | 'redeemed'
 *   at           cuándo lo usó (o cuándo reclamó el código)
 */
function byr_2x1_status(PDO $pdo, int $userId): array
{
    $row = byr_2x1_today($pdo, $userId);

    if (!$row) {
        return [
            'isWednesday' => byr_2x1_is_wednesday(),
            'used'        => false,
            'via'         => null,
            'status'      => null,
            'code'        => null,
            'label'       => null,
            'at'          => null,
        ];
    }

    $isWeb = (($row['prize_id'] ?? '') === BYR_2X1_PRIZE_ID_WEB);

    return [
        'isWednesday' => byr_2x1_is_wednesday(),
        'used'        => true,
        'via'         => $isWeb ? 'web' : 'codigo',
        'status'      => $row['status'],
        /* El de la web no es un vale para mostrar: ya se consumió. */
        'code'        => $isWeb ? null : $row['code'],
        'label'       => $row['prize_label'],
        'at'          => $row['redeemed_at'] ?: $row['created_at'],
    ];
}

/**
 * ¿Está encendido el camino web?
 *
 * Es una bandera de `api/config.php` para poder prenderlo y apagarlo sin
 * desplegar: se agregó como prueba piloto, con el miércoles ya en curso.
 *
 *   'perk_2x1_web' => true,
 */
function byr_2x1_web_enabled(): bool
{
    return (bool) byr_setting('perk_2x1_web', false);
}

/**
 * ¿Este socio puede sumar el 2x1 a un pedido web AHORA?
 *
 * Devuelve un array con el detalle, para que quien llama pueda explicar por
 * qué no se puede en vez de esconder el producto sin más:
 *   enabled     el camino web está encendido
 *   isWednesday hoy es miércoles en Argentina
 *   used        ya lo usó hoy (por la web o reclamando el código)
 *   canOrder    las tres de arriba dan verde
 */
function byr_2x1_web_offer(PDO $pdo, ?int $userId): array
{
    $enabled     = byr_2x1_web_enabled();
    $isWednesday = byr_2x1_is_wednesday();
    $used        = ($userId !== null) ? (byr_2x1_today($pdo, $userId) !== null) : false;

    return [
        'enabled'     => $enabled,
        'isWednesday' => $isWednesday,
        'used'        => $used,
        /* Sin sesión no hay 2x1: es un beneficio de socio, y hace falta saber
           quién es para que el límite semanal signifique algo. */
        'canOrder'    => $enabled && $isWednesday && !$used && $userId !== null,
    ];
}

/**
 * Marca el 2x1 del socio como usado por un pedido web. Devuelve el id de la
 * fila creada (para poder devolvérselo si el pedido se cancela).
 *
 * Queda como `redeemed` de entrada: no es un vale para mostrar en el local,
 * ya se consumió en el pedido. Aparece igual en "Mis cupones" como usado,
 * que es información útil para el socio.
 */
function byr_2x1_consume_for_order(PDO $pdo, int $userId, int $orderId): int
{
    $now  = byr_2x1_now()->format('Y-m-d H:i:s');
    $code = byr_generate_redemption_code($pdo);

    $ins = $pdo->prepare(
        'INSERT INTO redemptions
           (user_id, code, prize_id, prize_label, source, status, created_at, expires_at, redeemed_at)
         VALUES (?, ?, ?, ?, ?, "redeemed", ?, ?, ?)'
    );
    $ins->execute([
        $userId,
        $code,
        BYR_2X1_PRIZE_ID_WEB,
        BYR_2X1_LABEL . ' — usado en el pedido web #' . $orderId,
        BYR_2X1_SOURCE,
        $now,
        $now,
        $now,
    ]);

    return (int) $pdo->lastInsertId();
}

/**
 * Le devuelve el 2x1 al socio cuando su pedido se cancela. Sin esto, pedir el
 * 2x1 y que el local cancele el pedido te dejaba sin beneficio esa semana.
 */
function byr_2x1_release_for_order(PDO $pdo, int $userId, int $orderId): bool
{
    $del = $pdo->prepare(
        'DELETE FROM redemptions
          WHERE user_id = ? AND prize_id = ? AND prize_label LIKE ?
          LIMIT 1'
    );
    $del->execute([$userId, BYR_2X1_PRIZE_ID_WEB, '%pedido web #' . $orderId]);

    return $del->rowCount() === 1;
}
