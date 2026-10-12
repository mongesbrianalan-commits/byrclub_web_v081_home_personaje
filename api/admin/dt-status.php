<?php
/**
 * ADMIN — BYR DT: estado general para el panel.
 * La fecha en juego con sus partidos, las últimas fechas, cuántos equipos y
 * jugadores hay, y las fechas que ofrece la API para abrir la próxima.
 */
require_once __DIR__ . '/../dt/lib.php';

$pdo = db();
require_admin($pdo);
if (!byr_dt_ready($pdo)) {
    json_out(['ok' => true, 'ready' => false]);
}
byr_dt_ensure_lock($pdo);

$round = byr_dt_current_round($pdo);
$fixtures = [];
if ($round) {
    $st = $pdo->prepare('SELECT * FROM dt_fixtures WHERE round_id = ? ORDER BY kickoff');
    $st->execute([(int) $round['id']]);
    foreach ($st->fetchAll() as $f) {
        $fixtures[] = [
            'id'     => (int) $f['id'],
            'label'  => $f['home_name'] . ($f['home_goals'] !== null ? ' ' . $f['home_goals'] . ' – ' . $f['away_goals'] . ' ' : ' vs ') . $f['away_name'],
            'when'   => byr_dt_when($f['kickoff']),
            'status' => $f['status'],
            'done'   => in_array($f['status'], BYR_DT_DONE_STATUS, true),
            'void'   => in_array($f['status'], BYR_DT_VOID_STATUS, true),
            'scored' => (bool) $f['scored'],
        ];
    }
}

$rounds = [];
foreach ($pdo->query('SELECT r.*, t.name AS winner_name, u.name AS winner_user, tr.points AS winner_points
                        FROM dt_rounds r
                        LEFT JOIN dt_teams t ON t.id = r.winner_team_id
                        LEFT JOIN users u ON u.id = t.user_id
                        LEFT JOIN dt_team_rounds tr ON tr.round_id = r.id AND tr.team_id = r.winner_team_id
                       ORDER BY r.deadline DESC LIMIT 12') as $r) {
    $rounds[] = [
        'id'        => (int) $r['id'],
        'name'      => $r['name'],
        'status'    => $r['status'],
        'winner'    => $r['winner_name'] ? ['team' => $r['winner_name'], 'dt' => byr_dt_dt_name((string) $r['winner_user']), 'points' => (int) $r['winner_points'], 'code' => $r['winner_code']] : null,
        'delivered' => (bool) $r['prize_delivered'],
    ];
}

$teams    = (int) $pdo->query('SELECT COUNT(*) FROM dt_teams')->fetchColumn();
$complete = (int) $pdo->query('SELECT COUNT(*) FROM (SELECT team_id FROM dt_squads GROUP BY team_id HAVING COUNT(*) = 15) x')->fetchColumn();
$players  = (int) $pdo->query('SELECT COUNT(*) FROM dt_players WHERE active = 1 AND price > 0')->fetchColumn();
$lastSync = $pdo->query('SELECT MAX(updated_at) FROM dt_players')->fetchColumn();

/* Fechas disponibles en la API (para abrir la próxima). */
$apiRounds = [];
$apiCurrent = null;
$apiError = null;
try {
    $apiRounds  = byr_apifootball_get('fixtures/rounds', ['league' => byr_prode_league(), 'season' => byr_prode_season()]);
    $cur        = byr_apifootball_get('fixtures/rounds', ['league' => byr_prode_league(), 'season' => byr_prode_season(), 'current' => 'true']);
    $apiCurrent = $cur[0] ?? null;
} catch (RuntimeException $e) {
    $apiError = $e->getMessage();
}
$used = $pdo->query('SELECT api_round FROM dt_rounds')->fetchAll(PDO::FETCH_COLUMN);
$apiRounds = array_values(array_filter($apiRounds, fn($r) => !in_array($r, $used, true)));

json_out([
    'ok'         => true,
    'ready'      => true,
    'round'      => $round ? byr_dt_round_public($round) : null,
    'fixtures'   => $fixtures,
    'rounds'     => $rounds,
    'teams'      => $teams,
    'complete'   => $complete,
    'players'    => $players,
    'lastSync'   => $lastSync,
    'apiRounds'  => array_map(fn($r) => ['value' => $r, 'label' => $r . ' (' . byr_dt_round_label($r) . ')'], $apiRounds),
    'apiCurrent' => $apiCurrent,
    'apiError'   => $apiError,
]);
