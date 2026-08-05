<?php
/**
 * ADMIN — Trae los resultados de una fecha desde API-Football, marca los
 * partidos jugados, calcula el puntaje de cada pronóstico (🎯10 / ✅5 / ❌0)
 * y, si ya se jugaron TODOS los partidos, cierra la fecha y le da un cupón
 * al ganador (premio al mejor pronosticador de la fecha).
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

$in      = body_json();
$roundId = (int) ($in['roundId'] ?? 0);
if ($roundId <= 0) {
    json_out(['error' => 'Falta la fecha.'], 422);
}

$round = $pdo->prepare('SELECT * FROM prode_rounds WHERE id = ?');
$round->execute([$roundId]);
$round = $round->fetch();
if (!$round) {
    json_out(['error' => 'Esa fecha no existe.'], 404);
}

$matches = $pdo->prepare('SELECT * FROM prode_matches WHERE round_id = ?');
$matches->execute([$roundId]);
$matches = $matches->fetchAll();
if (!$matches) {
    json_out(['error' => 'Esa fecha no tiene partidos cargados.'], 404);
}

/* Ventana de fechas (UTC) que cubre la jornada, con margen de 1 día. */
$times = array_map(fn($m) => strtotime($m['kickoff'] . ' UTC'), $matches);
$from  = gmdate('Y-m-d', min($times) - 86400);
$to    = gmdate('Y-m-d', max($times) + 86400);

try {
    $fixtures = byr_apifootball_get('fixtures', [
        'league'   => byr_prode_league(),
        'season'   => byr_prode_season(),
        'from'     => $from,
        'to'       => $to,
        'timezone' => BYR_PRODE_TZ,
    ]);
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage(), 'code' => 'api-error'], 502);
}

/* Index por id de fixture. */
$byId = [];
foreach ($fixtures as $f) {
    $fid = (int) ($f['fixture']['id'] ?? 0);
    if ($fid) {
        $byId[$fid] = $f;
    }
}

$finishedShort = ['FT', 'AET', 'PEN'];
$updMatch = $pdo->prepare('UPDATE prode_matches SET status = "finished", home_goals = ?, away_goals = ? WHERE id = ?');

$matchesFinished = 0;
$predsScored     = 0;

foreach ($matches as $m) {
    if ($m['status'] === 'finished') {
        $matchesFinished++;
        continue; // ya estaba puntuado
    }
    $f = $byId[(int) $m['api_fixture_id']] ?? null;
    if (!$f) {
        continue;
    }
    $short = $f['fixture']['status']['short'] ?? 'NS';
    if (!in_array($short, $finishedShort, true)) {
        continue; // todavía no terminó
    }

    $rh = (int) ($f['goals']['home'] ?? 0);
    $ra = (int) ($f['goals']['away'] ?? 0);
    $updMatch->execute([$rh, $ra, (int) $m['id']]);
    $matchesFinished++;
    $predsScored += byr_prode_score_match($pdo, (int) $m['id'], $rh, $ra);
}

/* ¿Se jugaron todos? → cierra la fecha y premia al ganador. */
$closed = byr_prode_close_round_if_complete($pdo, $roundId);

json_out([
    'ok'              => true,
    'matchesFinished' => $matchesFinished,
    'matchesTotal'    => count($matches),
    'predsScored'     => $predsScored,
    'roundClosed'     => $closed['closed'],
    'winner'          => $closed['winner'],
]);
