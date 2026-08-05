<?php
/**
 * ADMIN — Sincroniza los partidos de una fecha desde API-Football hacia
 * nuestra base (tabla prode_matches). Se elige un nombre de fecha y una
 * ventana de días (from/to); trae los partidos de Primera Argentina en ese
 * rango y los guarda/actualiza. La API solo ALIMENTA la base; los
 * pronósticos y el puntaje corren sobre nuestras tablas.
 */
require_once __DIR__ . '/../prode/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

$in     = body_json();
$name   = trim($in['name'] ?? '');
$from   = trim($in['from'] ?? '');
$to     = trim($in['to'] ?? '');

if ($name === '') {
    json_out(['error' => 'Poné un nombre para la fecha (ej: "Fecha 8").'], 422);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    json_out(['error' => 'Elegí las fechas de inicio y fin (desde / hasta).'], 422);
}

$league = byr_prode_league();
$season = byr_prode_season();

try {
    $fixtures = byr_apifootball_get('fixtures', [
        'league'   => $league,
        'season'   => $season,
        'from'     => $from,
        'to'       => $to,
        'timezone' => BYR_PRODE_TZ,
    ]);
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage(), 'code' => 'api-error'], 502);
}

if (!$fixtures) {
    json_out(['error' => 'La API no devolvió partidos en ese rango. Revisá las fechas o la temporada.', 'code' => 'no-fixtures'], 404);
}

/* Fecha (round): reusamos una con el mismo nombre+temporada si existe, si no la creamos. */
$stmt = $pdo->prepare('SELECT id FROM prode_rounds WHERE name = ? AND season = ? LIMIT 1');
$stmt->execute([$name, $season]);
$roundId = $stmt->fetchColumn();
if (!$roundId) {
    $ins = $pdo->prepare('INSERT INTO prode_rounds (name, competition, season) VALUES (?, ?, ?)');
    $ins->execute([$name, 'Primera División Argentina', $season]);
    $roundId = (int) $pdo->lastInsertId();
}

$upsert = $pdo->prepare(
    'INSERT INTO prode_matches
        (round_id, api_fixture_id, home_team, away_team, home_logo, away_logo, kickoff, status, home_goals, away_goals)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        round_id = VALUES(round_id), home_team = VALUES(home_team), away_team = VALUES(away_team),
        home_logo = VALUES(home_logo), away_logo = VALUES(away_logo), kickoff = VALUES(kickoff),
        status = VALUES(status), home_goals = VALUES(home_goals), away_goals = VALUES(away_goals)'
);

$finishedShort = ['FT', 'AET', 'PEN'];
$count = 0;

foreach ($fixtures as $f) {
    $fx    = $f['fixture'] ?? [];
    $teams = $f['teams'] ?? [];
    $goals = $f['goals'] ?? [];
    $short = $fx['status']['short'] ?? 'NS';

    $isFinished = in_array($short, $finishedShort, true);
    $kickoffUtc = gmdate('Y-m-d H:i:s', strtotime($fx['date'] ?? 'now'));

    $upsert->execute([
        $roundId,
        (int) ($fx['id'] ?? 0),
        $teams['home']['name'] ?? '¿?',
        $teams['away']['name'] ?? '¿?',
        $teams['home']['logo'] ?? null,
        $teams['away']['logo'] ?? null,
        $kickoffUtc,
        $isFinished ? 'finished' : 'scheduled',
        $isFinished ? (int) ($goals['home'] ?? 0) : null,
        $isFinished ? (int) ($goals['away'] ?? 0) : null,
    ]);
    $count++;
}

json_out([
    'ok'      => true,
    'roundId' => (int) $roundId,
    'round'   => $name,
    'synced'  => $count,
]);
