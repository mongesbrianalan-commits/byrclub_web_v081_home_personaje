<?php
/**
 * Ranking del Prode: suma de puntos de cada socio (solo pronósticos ya
 * jugados/puntuados). Devuelve el Top N + la posición del que consulta.
 * Es un ranking PROPIO del prode, separado de los puntos canjeables de BYR.
 */
require_once __DIR__ . '/lib.php';

$meId = require_auth();
$pdo  = db();

const PRODE_RANKING_LIMIT = 50;

/** Primer nombre (para no exponer el nombre completo). */
function byr_prode_first_name(?string $name): string
{
    $name = trim((string) $name);
    if ($name === '') {
        return 'Socio BYR';
    }
    return preg_split('/\s+/', $name)[0];
}

$rows = $pdo->query(
    "SELECT u.id, u.name, u.avatar,
            COALESCE(SUM(p.points), 0) AS pts,
            SUM(CASE WHEN p.points = 10 THEN 1 ELSE 0 END) AS exacts
       FROM users u
       JOIN prode_predictions p ON p.user_id = u.id
      WHERE p.points IS NOT NULL
      GROUP BY u.id, u.name, u.avatar
      ORDER BY pts DESC, exacts DESC, u.id ASC"
)->fetchAll();

$ranking = [];
$you     = null;

foreach ($rows as $index => $r) {
    $position = $index + 1;
    $isYou    = ((int) $r['id'] === $meId);

    $entry = [
        'rank'   => $position,
        'name'   => byr_prode_first_name($r['name']),
        'avatar' => $r['avatar'] ?: '🍔',
        'points' => (int) $r['pts'],
        'exacts' => (int) $r['exacts'],
        'isYou'  => $isYou,
    ];

    if ($isYou) {
        $you = $entry;
    }
    if ($position <= PRODE_RANKING_LIMIT) {
        $ranking[] = $entry;
    }
}

json_out([
    'ranking' => $ranking,
    'you'     => $you,           // null si todavía no tiene puntos
    'total'   => count($rows),
    'limit'   => PRODE_RANKING_LIMIT,
]);
