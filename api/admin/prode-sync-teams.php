<?php
/**
 * ADMIN — Trae los escudos de todos los equipos de Primera desde API-Football
 * y los guarda en prode_teams. Usa la temporada 2024 (permitida en el plan
 * gratis; los clubes/escudos son los mismos que la actual). Además, completa
 * los escudos de los partidos ya cargados que no tengan.
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

/* La temporada actual no está en el plan gratis; 2024 sí y trae los mismos
   clubes. Si algún día pagás el plan, se puede subir este valor. */
$TEAMS_SEASON = 2024;

try {
    $teams = byr_apifootball_get('teams', [
        'league' => byr_prode_league(),
        'season' => $TEAMS_SEASON,
    ]);
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage(), 'code' => 'api-error'], 502);
}

if (!$teams) {
    json_out(['error' => 'La API no devolvió equipos. Revisá tu API key.', 'code' => 'no-teams'], 404);
}

$upsert = $pdo->prepare(
    'INSERT INTO prode_teams (api_team_id, name, norm, logo)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE api_team_id = VALUES(api_team_id), name = VALUES(name), logo = VALUES(logo)'
);

$count = 0;
foreach ($teams as $t) {
    $team = $t['team'] ?? [];
    $name = trim($team['name'] ?? '');
    if ($name === '') {
        continue;
    }
    $upsert->execute([
        (int) ($team['id'] ?? 0),
        $name,
        byr_prode_normalize_team($name),
        $team['logo'] ?? null,
    ]);
    $count++;
}

/* Completar escudos de los partidos ya cargados a mano (sin escudo). */
$backfilled = 0;
$rows = $pdo->query(
    "SELECT id, home_team, away_team, home_logo, away_logo FROM prode_matches
      WHERE home_logo IS NULL OR away_logo IS NULL"
)->fetchAll();

$updHome = $pdo->prepare('UPDATE prode_matches SET home_logo = ? WHERE id = ?');
$updAway = $pdo->prepare('UPDATE prode_matches SET away_logo = ? WHERE id = ?');

foreach ($rows as $m) {
    $changed = false;
    if (empty($m['home_logo'])) {
        $logo = byr_prode_find_logo($pdo, $m['home_team']);
        if ($logo) {
            $updHome->execute([$logo, (int) $m['id']]);
            $changed = true;
        }
    }
    if (empty($m['away_logo'])) {
        $logo = byr_prode_find_logo($pdo, $m['away_team']);
        if ($logo) {
            $updAway->execute([$logo, (int) $m['id']]);
            $changed = true;
        }
    }
    if ($changed) {
        $backfilled++;
    }
}

json_out([
    'ok'         => true,
    'teams'      => $count,
    'backfilled' => $backfilled,
]);
