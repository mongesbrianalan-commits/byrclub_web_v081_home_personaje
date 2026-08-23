<?php
/**
 * Utilidades comunes: respuestas JSON, sesión y estado por defecto.
 * Todos los endpoints incluyen este archivo al principio.
 */

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

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
        'state'        => $state,
    ];
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
