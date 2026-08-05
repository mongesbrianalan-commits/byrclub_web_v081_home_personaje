<?php
/**
 * Ranking de la comunidad BYR Club, ordenado por NIVEL/XP (no por puntos).
 * Se ordena por XP porque el XP nunca baja: canjear puntos por un beneficio
 * NO hace perder posiciones. Requiere sesión (visible para todos los socios).
 *
 * Devuelve el Top N + la posición del usuario que consulta (aunque quede
 * fuera del Top). Solo se expone el PRIMER NOMBRE y el avatar (privacidad).
 */
require_once __DIR__ . '/helpers.php';

$meId = require_auth();
$pdo  = db();

const RANKING_LIMIT = 50;

/** Nivel a partir del XP — misma fórmula que el front (user.js). */
function byr_level_from_xp(int $xp): int
{
    return (int) floor(sqrt(max(0, $xp) / 250)) + 1;
}

/** Primer nombre (para no exponer el nombre completo de los chicos). */
function byr_first_name(?string $name): string
{
    $name  = trim((string) $name);
    if ($name === '') {
        return 'Socio BYR';
    }
    $parts = preg_split('/\s+/', $name);
    return $parts[0];
}

/*
 * Traemos a todos y calculamos el XP en PHP (parseando el JSON de `state`)
 * en vez de con funciones JSON de SQL: es a prueba de estados malformados y
 * no depende de la versión de MariaDB. El club es chico, así que el costo es
 * despreciable. Solo contamos cuentas que ya eligieron avatar (onboarding
 * completo), para no ensuciar el ranking con registros a medio hacer.
 */
try {
    $rows = $pdo->query(
        "SELECT id, name, avatar, state
           FROM users
          WHERE avatar IS NOT NULL AND avatar <> ''"
    )->fetchAll();

    // Total de usuarios registrados (todas las cuentas, para el contador).
    $totalUsers = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
} catch (PDOException $e) {
    json_out([
        'error'  => 'No se pudo cargar el ranking en este momento.',
        'code'   => 'db-error',
        'detail' => $e->getMessage(),
    ], 500);
}

$list = [];
foreach ($rows as $r) {
    $state = !empty($r['state']) ? json_decode($r['state'], true) : [];
    $xp    = (int) ($state['progression']['xp'] ?? 0);

    $list[] = [
        'id'     => (int) $r['id'],
        'name'   => byr_first_name($r['name']),
        'avatar' => $r['avatar'] ?: '🍔',
        'xp'     => $xp,
        'level'  => byr_level_from_xp($xp),
    ];
}

/* Orden: más XP primero; a igual XP, el que se registró antes (id menor). */
usort($list, function ($a, $b) {
    return ($b['xp'] <=> $a['xp']) ?: ($a['id'] <=> $b['id']);
});

$ranking = [];
$you     = null;

foreach ($list as $index => $entry) {
    $position = $index + 1;
    $isYou    = ($entry['id'] === $meId);

    $public = [
        'rank'   => $position,
        'name'   => $entry['name'],
        'avatar' => $entry['avatar'],
        'xp'     => $entry['xp'],
        'level'  => $entry['level'],
        'isYou'  => $isYou,
    ];

    if ($isYou) {
        $you = $public;
    }
    if ($position <= RANKING_LIMIT) {
        $ranking[] = $public; // solo datos públicos (nombre de pila, avatar, xp, nivel)
    }
}

json_out([
    'ranking'    => $ranking,
    'you'        => $you,           // posición del que consulta (puede ser > RANKING_LIMIT)
    'total'      => count($list),   // socios en el ranking (con onboarding completo)
    'totalUsers' => $totalUsers,    // total de cuentas registradas (para el contador de arriba)
    'limit'      => RANKING_LIMIT,
]);
