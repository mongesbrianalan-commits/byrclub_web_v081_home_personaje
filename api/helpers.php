<?php
/**
 * Utilidades comunes: respuestas JSON, sesión y estado por defecto.
 * Todos los endpoints incluyen este archivo al principio.
 */

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

/* =========================================================
   Hora — todo el sistema piensa en hora de Argentina
   ---------------------------------------------------------
   El hosting corre en UTC, así que hasta acá cada lugar que necesitaba la
   hora se la arreglaba solo (y los que se olvidaban mostraban 23:33 para un
   pedido que había entrado 20:33). Ahora hay una sola regla:

     - PHP piensa en hora de Argentina        (date_default_timezone_set)
     - La base guarda en SU reloj, que es UTC (NOW(), created_at, ...)
     - Para MOSTRAR una fecha de la base se pasa por byr_dt_local()

   Lo que la base guarda NO se toca: cambiarlo obligaría a migrar todas las
   filas viejas y a dejar la columna con dos relojes mezclados.
========================================================= */

const BYR_TZ = 'America/Argentina/Buenos_Aires';

date_default_timezone_set(BYR_TZ);

/**
 * Cuánto adelanta el reloj de la BASE respecto de UTC, en segundos.
 *
 * Se le pregunta a la base en vez de darlo por sentado: hoy Hostinger la tiene
 * en UTC (0), pero si mañana la mueven, las horas siguen saliendo bien sin
 * tocar una línea. Se consulta una sola vez por request.
 */
function byr_db_utc_offset(): int
{
    static $off = null;
    if ($off === null) {
        try {
            $off = (int) db()->query('SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())')->fetchColumn();
        } catch (Throwable $e) {
            $off = 0; // si falla, asumimos UTC, que es como está hoy
        }
    }
    return $off;
}

/** Un DATETIME de la base (en el reloj de la base) → DateTime en hora de Argentina. */
function byr_dt_local(?string $dbDateTime): ?DateTimeImmutable
{
    if ($dbDateTime === null || trim($dbDateTime) === '') {
        return null;
    }
    $off  = byr_db_utc_offset();
    $sign = $off < 0 ? '-' : '+';
    $abs  = abs($off);
    $tz   = sprintf('%s%02d:%02d', $sign, intdiv($abs, 3600), intdiv($abs % 3600, 60));

    try {
        $dt = new DateTimeImmutable($dbDateTime, new DateTimeZone($tz));
        return $dt->setTimezone(new DateTimeZone(BYR_TZ));
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Etiqueta lista para mostrar de un DATETIME de la base, en hora de Argentina.
 * Es lo que se manda al navegador: así el panel no hace cuentas de husos, que
 * es donde se venía colando el error de las 3 horas.
 */
function byr_dt_label(?string $dbDateTime, string $format = 'd/m H:i'): ?string
{
    $dt = byr_dt_local($dbDateTime);
    return $dt ? $dt->format($format) : null;
}

/**
 * Medianoche argentina de hace $daysAgo días, escrita en el reloj de la BASE,
 * para poder compararla contra created_at.
 *
 * Sin esto, "hoy" se calculaba con date('Y-m-d') sobre un servidor en UTC: el
 * día cambiaba a las 21:00 de Argentina, o sea que las estadísticas del día se
 * reiniciaban en el medio del turno.
 */
function byr_day_start_db(int $daysAgo = 0): string
{
    /* Negativo = hacia adelante: -1 es la medianoche de mañana, que sirve para
       cerrar el rango de "hoy". */
    $start = (new DateTimeImmutable('today', new DateTimeZone(BYR_TZ)))
        ->modify(($daysAgo <= 0 ? '+' . abs($daysAgo) : '-' . $daysAgo) . ' days')
        ->getTimestamp();

    return gmdate('Y-m-d H:i:s', $start + byr_db_utc_offset());
}

/**
 * Los dos extremos de una JORNADA de trabajo, escritos en el reloj de la base.
 *
 * Una jornada no es un día de calendario: el turno arranca a la tarde y puede
 * terminar pasada la medianoche. Si se cortara a las 00:00, un pedido de las
 * 00:20 caería en el día siguiente y no se le contaría al turno en el que se
 * trabajó — que es justo lo que hay que pagarle al delivery.
 *
 * Por eso el corte es a las 06:00 de Argentina (configurable con
 * 'shift_start_hour'): a esa hora no hay nadie trabajando, así que ninguna
 * jornada se parte al medio.
 *
 * $ymd = null → la jornada en curso. Antes de las 06:00, esa es la que arrancó
 * AYER: a las 00:20 del sábado todavía se está laburando el viernes.
 */
function byr_shift_bounds(?string $ymd = null): array
{
    $hhmm = (string) byr_setting('shift_start_hour', '06:00');
    if (!preg_match('/^\d{1,2}:\d{2}$/', $hhmm)) {
        $hhmm = '06:00';
    }
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    $tz = new DateTimeZone(BYR_TZ);

    if ($ymd !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) {
        $start = (new DateTimeImmutable($ymd . ' 00:00:00', $tz))->setTime($h, $m);
    } else {
        $now   = new DateTimeImmutable('now', $tz);
        $start = $now->setTime($h, $m);
        if ($now < $start) {
            $start = $start->modify('-1 day'); // madrugada: sigue siendo la jornada de ayer
        }
    }
    $end = $start->modify('+1 day');
    $off = byr_db_utc_offset();

    return [
        'ymd'     => $start->format('Y-m-d'),
        'startDb' => gmdate('Y-m-d H:i:s', $start->getTimestamp() + $off),
        'endDb'   => gmdate('Y-m-d H:i:s', $end->getTimestamp() + $off),
        'label'   => $start->format('d/m'),
        'from'    => $start->format('d/m H:i'),
        'to'      => $end->format('d/m H:i'),
    ];
}

/* =========================================================
   Beneficios de socio — montos (fáciles de cambiar acá)
========================================================= */
const BYR_WELCOME_BONUS  = 300; // puntos de regalo al crear la cuenta
const BYR_REFERRAL_BONUS = 300; // puntos para CADA uno (invitado e invitador)

// Cada vale de premio vence a las 24hs de emitido, salvo los "especiales"
// (cumpleaños y ganador del prode) que duran 7 días. Los vales viejos
// (creados antes de esta regla) tienen expires_at = NULL y NO vencen.
const BYR_REDEMPTION_TTL_HOURS         = 24;       // ruleta, raspadita, 2x1
const BYR_REDEMPTION_TTL_HOURS_SPECIAL = 24 * 7;   // cumpleaños y prode: 7 días

/* Sesión con cookie segura (HttpOnly + SameSite). "secure" solo si hay HTTPS. */
$byr_secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? null) == 443);

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30, // 30 días
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => $byr_secure,
]);
session_name('byrclub_sess');
session_start();

/**
 * Lee un valor de config.php (el mismo archivo que usa la base). Cachea la
 * lectura. Sirve para claves que no son de la base (p. ej. la tasa de puntos
 * de los pedidos). Devuelve $default si el archivo o la clave no existen.
 */
function byr_setting(string $key, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $path = __DIR__ . '/config.php';
        $cfg  = file_exists($path) ? (require $path) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg[$key] ?? $default;
}

/**
 * Costo de envío del delivery (ARS enteros). Fijo para toda la zona por ahora;
 * se cambia desde config.php con 'delivery_fee' sin tocar código. El retiro en
 * el local no paga envío.
 */
function byr_delivery_fee(): int
{
    $fee = (int) byr_setting('delivery_fee', 490);
    return $fee > 0 ? $fee : 0;
}

/**
 * Horario en que se puede pedir POR LA WEB.
 *
 * Se configura en api/config.php, sin desplegar:
 *
 *   'order_hours' => ['19:40', '23:30'],
 *
 * Poner null (o un valor inválido) deja el pedido abierto las 24hs, que es
 * como venía funcionando. Soporta cruzar la medianoche: ['20:00','01:30'].
 *
 * No afecta al mostrador: el cajero vende cuando el local está abierto,
 * tenga el horario web abierto o no.
 */
function byr_order_hours(): ?array
{
    $h = byr_setting('order_hours', ['19:40', '23:30']);

    if (!is_array($h) || count($h) < 2) {
        return null;
    }

    $open  = trim((string) $h[0]);
    $close = trim((string) $h[1]);

    if (!preg_match('/^\d{1,2}:\d{2}$/', $open) || !preg_match('/^\d{1,2}:\d{2}$/', $close)) {
        return null;
    }

    return ['open' => $open, 'close' => $close];
}

/**
 * ¿Hoy el local NO toma pedidos, sea la hora que sea?
 *
 * Dos listas, las dos se cambian en api/config.php sin desplegar:
 *
 *   'order_closed_weekdays' => [1],   // 1 = lunes, 2 = martes … 7 = domingo
 *   'order_closed_dates'    => ['2026-09-22' => 'por un desperfecto en el gas del local'],
 *
 * La primera es la regla fija (los lunes está cerrado). La segunda son los
 * cierres de un día puntual, con el motivo para poder contarlo. Una fecha que
 * ya pasó no molesta, así que se pueden dejar acumuladas.
 *
 * Devuelve null si hoy se trabaja, o el MOTIVO si está cerrado. El motivo se
 * le muestra al cliente dentro de una frase ("Hoy no estamos tomando pedidos
 * <motivo>."), así que se escribe en minúscula y sin punto final.
 */
function byr_closed_today(): ?string
{
    $hoy = new DateTime('now', new DateTimeZone(BYR_TZ));

    /* Primero la fecha puntual: pisa al día de la semana y, sobre todo, tiene
       un motivo real que contar en vez de "los lunes no abrimos". */
    $fechas = byr_setting('order_closed_dates', [
        '2026-09-22' => 'por un desperfecto en el gas del local',
    ]);
    if (is_array($fechas)) {
        $clave = $hoy->format('Y-m-d');
        foreach ($fechas as $fecha => $motivo) {
            /* Admite las dos formas: ['2026-09-22' => 'motivo'] y ['2026-09-22'] */
            if (is_int($fecha)) {
                $fecha  = $motivo;
                $motivo = '';
            }
            if (trim((string) $fecha) === $clave) {
                $motivo = trim((string) $motivo);
                return $motivo !== '' ? $motivo : 'porque hoy el local está cerrado';
            }
        }
    }

    $dias = byr_setting('order_closed_weekdays', [1]);
    if (is_array($dias)) {
        $n = (int) $hoy->format('N');
        foreach ($dias as $d) {
            if ((int) $d === $n) {
                $nombres = [1 => 'lunes', 2 => 'martes', 3 => 'miércoles', 4 => 'jueves',
                            5 => 'viernes', 6 => 'sábados', 7 => 'domingos'];
                return 'porque los ' . ($nombres[$n] ?? 'días como hoy') . ' no abrimos';
            }
        }
    }

    return null;
}

/** "19:40" -> 1180 (minutos desde medianoche). */
function byr_minutes_of_day(string $hhmm): int
{
    $p = explode(':', $hhmm);
    return ((int) $p[0]) * 60 + ((int) ($p[1] ?? 0));
}

/**
 * ¿Se puede pedir AHORA por la web? La hora se calcula SIEMPRE en Argentina,
 * no en la del servidor: el hosting está en UTC y a las 21:00 de acá serían
 * las 00:00 de allá, que dejaría la web cerrada justo en el pico de venta.
 *
 * Devuelve el detalle para que la carta pueda explicar hasta qué hora, en vez
 * de sólo decir que no.
 */
function byr_orders_window(): array
{
    $now  = new DateTime('now', new DateTimeZone(BYR_TZ));
    $hora = $now->format('H:i');
    $h    = byr_order_hours();

    /* Días cerrados: mandan sobre el horario. Va antes que todo porque un
       lunes no importa que sean las 21:00, y porque el motivo que devuelve
       es más útil que repetir de qué hora a qué hora se pide. */
    $cerrado = byr_closed_today();
    if ($cerrado !== null) {
        return [
            'limited'      => true,
            'isOpen'       => false,
            'closedAllDay' => true,
            'reason'       => $cerrado,
            'open'         => $h['open']  ?? null,
            'close'        => $h['close'] ?? null,
            'now'          => $hora,
        ];
    }

    if (!$h) {
        return [
            'limited'      => false,
            'isOpen'       => true,
            'closedAllDay' => false,
            'reason'       => null,
            'open'         => null,
            'close'        => null,
            'now'          => $hora,
        ];
    }

    $o = byr_minutes_of_day($h['open']);
    $c = byr_minutes_of_day($h['close']);
    $n = byr_minutes_of_day($hora);

    /* Si el cierre es menor que la apertura, el turno cruza la medianoche. */
    $abierto = ($o <= $c) ? ($n >= $o && $n < $c) : ($n >= $o || $n < $c);

    return [
        'limited'      => true,
        'isOpen'       => $abierto,
        'closedAllDay' => false,
        'reason'       => null,
        'open'         => $h['open'],
        'close'        => $h['close'],
        'now'          => $hora,
    ];
}

/**
 * ¿Está corrida la migración del costo de envío (2026-08-delivery-fee.sql)?
 * Mientras no lo esté, los pedidos se guardan como antes (sin envío) en vez de
 * fallar. Cachea el resultado.
 */
function byr_shipping_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM orders LIKE 'shipping_cost'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * Medios de pago que el CLIENTE puede declarar al pedir por la web.
 * Es más corta que la lista de la caja (byr_payment_methods()) a propósito:
 * tarjeta y QR solo tienen sentido presencialmente, con el posnet en la mano.
 */
function byr_payment_prefs(): array
{
    return ['efectivo', 'transferencia'];
}

/**
 * ¿Está corrida la migración del medio de pago (2026-08-payment-pref.sql)?
 * Mientras no lo esté, el pedido se guarda sin ese dato en vez de fallar.
 */
function byr_payment_pref_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM orders LIKE 'payment_pref'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * ¿Está corrida la migración del límite diario del Memotest
 * (2026-08-memory-daily.sql)? Sin esa columna no se puede garantizar
 * "1 partida por día", así que el juego avisa en vez de repartir puntos
 * que se podrían cobrar dos veces. Cachea el resultado.
 */
function byr_memory_daily_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM users LIKE 'last_memory_play'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * ¿Está corrida la migración del límite diario de la Raspadita
 * (2026-08-scratch-daily.sql)? Sin esa columna no se puede garantizar
 * "una raspadita por día": el límite viviría solo en el navegador y
 * refrescando la página se podría volver a jugar (y hasta elegir el
 * premio). Mientras falte, el juego avisa en vez de repartir puntos.
 * Cachea el resultado.
 */
function byr_scratch_daily_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM users LIKE 'last_scratch_play'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/** Emite una respuesta JSON y corta la ejecución. */
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Lee y decodifica el cuerpo JSON de la petición. */
function body_json(): array
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Corta si el método HTTP no es el esperado. */
function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        json_out(['error' => 'Método no permitido.'], 405);
    }
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

/** Exige sesión activa; corta con 401 si no hay. */
function require_auth(): int
{
    $id = current_user_id();
    if (!$id) {
        json_out(['error' => 'No hay sesión activa.'], 401);
    }
    return $id;
}

/**
 * Exige sesión activa Y que el usuario sea admin. Corta con 401/403 si no.
 * Devuelve el id del admin. Reemplaza el chequeo repetido de is_admin.
 */
function require_admin(PDO $pdo): int
{
    $id   = require_auth();
    $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $me = $stmt->fetch();
    if (!$me || !$me['is_admin']) {
        json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
    }
    return $id;
}

/**
 * Rol efectivo del usuario: 'admin' | 'cajero' | 'cocina' | 'socio'.
 * is_admin manda: si está en 1, es 'admin'. Resiliente a que la columna `role`
 * todavía no exista (antes de correr 2026-08-roles.sql): en ese caso todos son
 * admin o socio, igual que antes.
 */
function byr_role(PDO $pdo, int $id): string
{
    try {
        $stmt = $pdo->prepare('SELECT is_admin, role FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $r = $stmt->fetch();
    } catch (Throwable $e) {
        $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $r = $stmt->fetch();
    }
    if (!$r) {
        return 'socio';
    }
    if (!empty($r['is_admin'])) {
        return 'admin';
    }
    return $r['role'] ?? 'socio';
}

/**
 * Exige que el usuario sea admin (siempre permitido) O tenga uno de los roles
 * en $allowed (p. ej. ['cajero']). Corta con 401/403. Devuelve su id.
 */
function require_role(PDO $pdo, array $allowed): int
{
    $id   = require_auth();
    $role = byr_role($pdo, $id);
    if ($role === 'admin' || in_array($role, $allowed, true)) {
        return $id;
    }
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

/** Estado de juego inicial para una cuenta nueva. */
function default_state(string $name, ?string $avatar = null): array
{
    return [
        'profile'     => ['name' => $name, 'avatar' => $avatar],
        'wallet'      => ['points' => 0],
        'progression' => ['xp' => 0, 'streak' => 0, 'lastVisit' => null],
        'inventory'   => [],
        'achievements' => [],
        'history'     => [],
    ];
}

/** Convierte una fila de la tabla en el objeto público (sin password). */
function public_user(array $row): array
{
    $state = !empty($row['state']) ? json_decode($row['state'], true) : null;

    return [
        'email'        => $row['email'],
        'name'         => $row['name'],
        'avatar'       => $row['avatar'],
        'whatsapp'     => $row['whatsapp'] ?? null,
        'isAdmin'      => (bool) $row['is_admin'],
        'role'         => !empty($row['is_admin']) ? 'admin' : ($row['role'] ?? 'socio'),
        'onboarded'    => !empty($row['avatar']),
        'birthdate'    => $row['birthdate'] ?? null,
        'referralCode' => $row['referral_code'] ?? null,
        'referredBy'   => isset($row['referred_by']) ? (int) $row['referred_by'] : null,
        'lastRouletteSpin' => $row['last_roulette_spin'] ?? null,
        'rouletteSpunToday' => (($row['last_roulette_spin'] ?? null) === date('Y-m-d')),
        'lastMemoryPlay'    => $row['last_memory_play'] ?? null,
        'memoryPlayedToday' => (($row['last_memory_play'] ?? null) === date('Y-m-d')),
        'lastScratchPlay'   => $row['last_scratch_play'] ?? null,
        'scratchPlayedToday' => (($row['last_scratch_play'] ?? null) === date('Y-m-d')),
        'state'        => $state,
    ];
}

/**
 * Un nombre convertido en identificador estable: "Wraps de Pollo" →
 * "wraps-de-pollo". Lo usan los productos y las categorías del menú.
 *
 * Las vocales con tilde y la ñ se pasan a su letra pelada ANTES de bajar a
 * minúsculas, y el mapa incluye las mayúsculas a propósito: strtolower()
 * trabaja byte a byte y no toca la "Ñ", así que "Ñoquis" llegaba entero al
 * preg_replace de abajo y salía como "oquis" — sin la primera letra.
 *
 * Devuelve '' si no queda nada utilizable (un nombre de solo emojis). Quien
 * llama decide qué hacer con eso: no inventamos un identificador acá.
 */
function byr_slugify(string $name): string
{
    $map = [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u',
        'ü' => 'u', 'ñ' => 'n', 'ç' => 'c',
        'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u',
        'À' => 'a', 'È' => 'e', 'Ì' => 'i', 'Ò' => 'o', 'Ù' => 'u',
        'Ü' => 'u', 'Ñ' => 'n', 'Ç' => 'c',
    ];

    $slug = strtolower(strtr(trim($name), $map));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);

    return trim((string) $slug, '-');
}

/**
 * Suma puntos y/o XP a un estado y deja el movimiento en el historial.
 * Es la forma "oficial" de otorgar puntos del lado del servidor (bienvenida,
 * referidos, admin). Modifica $state por referencia.
 */
function byr_grant(array &$state, int $points, int $xp, string $reason, string $type = 'bonus'): void
{
    $state['wallet']['points']  = ($state['wallet']['points'] ?? 0) + $points;
    $state['progression']['xp'] = ($state['progression']['xp'] ?? 0) + $xp;

    if (!isset($state['history']) || !is_array($state['history'])) {
        $state['history'] = [];
    }
    array_unshift($state['history'], [
        'type'   => $type,
        'points' => $points,
        'xp'     => $xp,
        'reason' => $reason,
        'date'   => date('c'),
    ]);
}

/**
 * Descuenta puntos del estado y deja el movimiento en el historial.
 * Es el contrapeso de byr_grant(): la unica forma de gastar puntos del lado
 * del servidor (hoy, el canje de recompensas de la pagina Beneficios).
 *
 * Devuelve false si no le alcanzan, sin tocar nada. El XP NO se descuenta:
 * el nivel es progreso, no moneda, y canjear no te hace retroceder.
 */
function byr_spend(array &$state, int $points, string $reason, string $type = 'redeem'): bool
{
    $balance = (int) ($state['wallet']['points'] ?? 0);

    if ($points <= 0 || $balance < $points) {
        return false;
    }

    $state['wallet']['points'] = $balance - $points;

    if (!isset($state['history']) || !is_array($state['history'])) {
        $state['history'] = [];
    }
    array_unshift($state['history'], [
        'type'   => $type,
        'points' => -$points,
        'xp'     => 0,
        'reason' => $reason,
        'date'   => date('c'),
    ]);

    return true;
}

/**
 * Genera un código de invitación único (BYR + 5 caracteres de un alfabeto
 * sin caracteres ambiguos). Reintenta si choca con uno existente.
 */
function byr_generate_referral_code(PDO $pdo): string
{
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
    $check = $pdo->prepare('SELECT 1 FROM users WHERE referral_code = ?');

    for ($attempt = 0; $attempt < 12; $attempt++) {
        $code = 'BYR';
        for ($i = 0; $i < 5; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $check->execute([$code]);
        if (!$check->fetch()) {
            return $code;
        }
    }
    // Fallback prácticamente imposible de alcanzar.
    return 'BYR' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 5));
}

/**
 * Cuenta exprés por teléfono (pedido de invitado): busca un usuario cuyo WhatsApp
 * termine igual (últimos 8 dígitos, misma lógica que lookup.php). Si existe,
 * devuelve su id (ahí se acreditan los puntos). Si no, crea una cuenta liviana
 * SIN contraseña usable ni email, y devuelve el id nuevo. Requiere que la columna
 * `email` admita NULL (migración 2026-08-guest-orders.sql).
 */
function byr_find_or_create_phone_account(PDO $pdo, string $name, string $phone): int
{
    $digits = preg_replace('/\D/', '', $phone);
    $last   = strlen($digits) >= 8 ? substr($digits, -8) : $digits;

    if (strlen($last) >= 6) {
        try {
            $sql = "SELECT id FROM users
                     WHERE whatsapp IS NOT NULL AND whatsapp <> ''
                       AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(whatsapp,' ',''),'-',''),'+',''),'(',''),')',''),'.','') LIKE ?
                     ORDER BY id ASC LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['%' . $last]);
            $row = $stmt->fetch();
            if ($row) {
                return (int) $row['id'];
            }
        } catch (Throwable $e) {
            /* si algo raro pasa con la búsqueda, seguimos y creamos la cuenta */
        }
    }

    $safeName = function_exists('mb_substr') ? mb_substr($name, 0, 120) : substr($name, 0, 120);
    $state = default_state($safeName, null);
    $code  = byr_generate_referral_code($pdo);
    $state['profile']['referralCode'] = $code;
    $hash  = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT); // sin contraseña usable

    $ins = $pdo->prepare(
        'INSERT INTO users (email, password_hash, name, whatsapp, state, referral_code)
         VALUES (NULL, ?, ?, ?, ?, ?)'
    );
    try {
        $ins->execute([$hash, $safeName, $phone, json_encode($state, JSON_UNESCAPED_UNICODE), $code]);
    } catch (Throwable $e) {
        // Falta la migración que hace `email` nullable.
        json_out(['error' => 'Todavía no se puede pedir sin cuenta. (Falta correr 2026-08-guest-orders.sql.)', 'code' => 'guest-not-ready'], 503);
    }
    return (int) $pdo->lastInsertId();
}

/**
 * Cupones que, en vez de entregar algo, cambian CUÁNTOS PUNTOS se acreditan.
 * Hoy hay uno solo: el "2x puntos" de la ruleta.
 *
 * Hasta esta versión no existía: el vale se marcaba canjeado y los puntos se
 * acreditaban igual que siempre. O sea que el premio prometía "tu próxima
 * compra suma el doble" y no lo cumplía en ningún camino — ni en el pedido
 * online, ni en el mostrador (que ni siquiera aceptaba cupones).
 */
const BYR_POINT_MULTIPLIERS = [
    'double-points' => 2,
];

/**
 * Canjea un vale del socio y devuelve qué era. Devuelve null si no se pudo:
 * no es suyo, ya se usó, o venció.
 *
 * Es atómico (SELECT ... FOR UPDATE + UPDATE condicional), así que dos cargas
 * simultáneas no lo pueden canjear dos veces. Tiene que llamarse DENTRO de una
 * transacción, y ANTES de acreditar los puntos: si el vale es un multiplicador,
 * el resultado cambia cuánto se acredita.
 *
 * `multiplier` viene en 1 para los vales normales (papas, bebida), así que
 * quien llama puede multiplicar siempre sin preguntar.
 */
function byr_redeem_coupon(PDO $pdo, string $code, int $userId, int $adminId): ?array
{
    $sel = $pdo->prepare(
        'SELECT id, prize_id, prize_label
           FROM redemptions
          WHERE code = ? AND user_id = ? AND status = "pending"
            AND (expires_at IS NULL OR expires_at > NOW())
          FOR UPDATE'
    );
    $sel->execute([$code, $userId]);
    $row = $sel->fetch();

    if (!$row) {
        return null;
    }

    $upd = $pdo->prepare(
        'UPDATE redemptions
            SET status = "redeemed", redeemed_at = NOW(), redeemed_by = ?
          WHERE id = ? AND status = "pending"'
    );
    $upd->execute([$adminId, (int) $row['id']]);

    if ($upd->rowCount() !== 1) {
        return null;
    }

    return [
        'prizeId'    => $row['prize_id'],
        'label'      => $row['prize_label'],
        'multiplier' => BYR_POINT_MULTIPLIERS[$row['prize_id']] ?? 1,
    ];
}

/**
 * Genera un código de vale de premio único (formato BYR-XXXXXX con un
 * alfabeto sin caracteres ambiguos). Reintenta si choca.
 */
function byr_generate_redemption_code(PDO $pdo): string
{
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
    $check = $pdo->prepare('SELECT 1 FROM redemptions WHERE code = ?');

    for ($attempt = 0; $attempt < 12; $attempt++) {
        $code = 'BYR-';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $check->execute([$code]);
        if (!$check->fetch()) {
            return $code;
        }
    }
    return 'BYR-' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 6));
}
