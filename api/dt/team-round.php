<?php
/**
 * BYR DT — el equipo de un socio en una fecha ya arrancada: la cancha con
 * los puntos de cada jugador. Sirve para "Ver el equipo ganador" y para
 * mirar el de cualquiera del ranking. Una fecha abierta no se muestra
 * (nadie puede espiar el equipo de otro antes del cierre).
 *
 * GET ?team=ID&round=ID   (sin round: la última cerrada)
 */
require_once __DIR__ . '/lib.php';

require_auth();
$pdo = db();
byr_dt_require_ready($pdo);
byr_dt_ensure_lock($pdo);

$teamId  = (int) ($_GET['team'] ?? 0);
$roundId = (int) ($_GET['round'] ?? 0);
if ($roundId) {
    $st = $pdo->prepare("SELECT * FROM dt_rounds WHERE id = ? AND status <> 'open'");
    $st->execute([$roundId]);
    $round = $st->fetch() ?: null;
} else {
    $round = byr_dt_last_closed_round($pdo);
}
if (!$round) {
    json_out(['error' => 'Esa fecha todavía no arrancó.'], 404);
}

$t = $pdo->prepare('SELECT t.*, u.name AS user_name FROM dt_teams t JOIN users u ON u.id = t.user_id WHERE t.id = ?');
$t->execute([$teamId]);
$team = $t->fetch();
if (!$team) {
    json_out(['error' => 'No existe ese equipo.'], 404);
}

$lu = $pdo->prepare(
    'SELECT l.player_id, l.position, l.starter, l.captain, p.*, c.name AS club_name, c.short AS club_short
       FROM dt_lineups l JOIN dt_players p ON p.id = l.player_id LEFT JOIN dt_clubs c ON c.id = p.club_id
      WHERE l.round_id = ? AND l.team_id = ?'
);
$lu->execute([(int) $round['id'], $teamId]);
$lineup = $lu->fetchAll();
if (!$lineup) {
    json_out(['error' => 'Ese equipo no jugó esa fecha.'], 404);
}

$sc = $pdo->prepare('SELECT player_id, points, minutes FROM dt_scores WHERE round_id = ?');
$sc->execute([(int) $round['id']]);
$scores = [];
foreach ($sc->fetchAll() as $s) {
    $scores[(int) $s['player_id']] = $s;
}
$res = byr_dt_team_points($lineup, $scores);

$players = [];
foreach ($lineup as $l) {
    $p = byr_dt_player_public($l);
    $p['pos']     = $l['position'];
    $p['starter'] = (bool) $l['starter'];
    $p['captain'] = (bool) $l['captain'];
    $p['played']  = array_key_exists((int) $l['player_id'], $res['used']);
    $p['points']  = $res['used'][(int) $l['player_id']] ?? (isset($scores[(int) $l['player_id']]) ? (int) $scores[(int) $l['player_id']]['points'] : 0);
    $players[] = $p;
}

/* Formación real del once que jugó la fecha. */
$count = ['DEF' => 0, 'MED' => 0, 'DEL' => 0];
foreach ($lineup as $l) {
    if ((int) $l['starter'] && isset($count[$l['position']])) {
        $count[$l['position']]++;
    }
}

json_out([
    'ok'        => true,
    'round'     => byr_dt_round_public($round),
    'team'      => byr_dt_team_public($team),
    'formation' => implode('-', $count),
    'points'    => $res['points'],
    'players'   => $players,
    'isWinner'  => (int) $round['winner_team_id'] === $teamId,
]);
