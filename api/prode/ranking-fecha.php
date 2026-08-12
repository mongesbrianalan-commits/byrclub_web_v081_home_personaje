<?php
/**
 * Ranking de la FECHA EN JUEGO del Prode: suma de puntos de cada socio pero
 * SOLO de la fecha actual (la misma que muestra round.php). Se actualiza a
 * medida que se van jugando/puntuando los partidos de esa fecha. Es un ranking
 * aparte del general (ranking.php), que acumula TODAS las fechas del torneo.
 */
require_once __DIR__ . '/lib.php';

$meId = require_auth();
$pdo  = db();

const PRODE_FECHA_RANKING_LIMIT = 50;

/** Primer nombre (para no exponer el nombre completo). */
function byr_prode_first_name(?string $name): string
{
    $name = trim((string) $name);
    if ($name === '') {
        return 'Socio BYR';
    }
    return preg_split('/\s+/', $name)[0];
}

/* Misma "fecha en juego" que usa round.php: prioriza la abierta y, dentro de
   esas, la de id más alto. Así los dos rankings hablan de la misma fecha. */
$round = $pdo->query(
    "SELECT r.* FROM prode_rounds r
      WHERE EXISTS (SELECT 1 FROM prode_matches m WHERE m.round_id = r.id)
      ORDER BY (r.status = 'open') DESC, r.id DESC
      LIMIT 1"
)->fetch();

if (!$round) {
    json_out(['round' => null, 'ranking' => [], 'you' => null, 'total' => 0]);
}

/* Puntos de cada socio SOLO en esta fecha (pronósticos ya puntuados). */
$stmt = $pdo->prepare(
    "SELECT u.id, u.name, u.avatar,
            COALESCE(SUM(p.points), 0) AS pts,
            SUM(CASE WHEN p.points = 10 THEN 1 ELSE 0 END) AS exacts
       FROM users u
       JOIN prode_predictions p ON p.user_id = u.id
       JOIN prode_matches m ON m.id = p.match_id
      WHERE m.round_id = ? AND p.points IS NOT NULL
      GROUP BY u.id, u.name, u.avatar
      ORDER BY pts DESC, exacts DESC, u.id ASC"
);
$stmt->execute([(int) $round['id']]);
$rows = $stmt->fetchAll();

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
    if ($position <= PRODE_FECHA_RANKING_LIMIT) {
        $ranking[] = $entry;
    }
}

json_out([
    'round'   => [
        'id'     => (int) $round['id'],
        'name'   => $round['name'],
        'status' => $round['status'],
    ],
    'ranking' => $ranking,
    'you'     => $you,           // null si todavía no sumó en esta fecha
    'total'   => count($rows),
    'limit'   => PRODE_FECHA_RANKING_LIMIT,
]);
