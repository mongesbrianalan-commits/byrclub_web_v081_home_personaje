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
        'onboarded'    => !empty($row['avatar']),
        'birthdate'    => $row['birthdate'] ?? null,
        'referralCode' => $row['referral_code'] ?? null,
        'referredBy'   => isset($row['referred_by']) ? (int) $row['referred_by'] : null,
        'lastRouletteSpin' => $row['last_roulette_spin'] ?? null,
        'rouletteSpunToday' => (($row['last_roulette_spin'] ?? null) === date('Y-m-d')),
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
