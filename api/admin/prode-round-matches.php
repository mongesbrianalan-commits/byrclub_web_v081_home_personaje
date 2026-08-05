<?php
/**
 * ADMIN — Lista los partidos de una fecha (con su ID y estado) para poder
 * cargar resultados a mano desde el panel.
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

$roundId = (int) (body_json()['roundId'] ?? 0);
if ($roundId <= 0) {
    json_out(['error' => 'Falta el ID de la fecha.'], 422);
}

$round = $pdo->prepare('SELECT name FROM prode_rounds WHERE id = ?');
$round->execute([$roundId]);
$roundName = $round->fetchColumn();
if ($roundName === false) {
    json_out(['error' => 'Esa fecha no existe.'], 404);
}

$stmt = $pdo->prepare(
    'SELECT id, home_team, away_team, kickoff, status, home_goals, away_goals
       FROM prode_matches WHERE round_id = ? ORDER BY kickoff ASC, id ASC'
);
$stmt->execute([$roundId]);

$matches = [];
foreach ($stmt->fetchAll() as $m) {
    $matches[] = [
        'id'           => (int) $m['id'],
        'home'         => $m['home_team'],
        'away'         => $m['away_team'],
        'kickoffLabel' => byr_prode_kickoff_label($m['kickoff']),
        'status'       => $m['status'],
        'homeGoals'    => $m['home_goals'] !== null ? (int) $m['home_goals'] : null,
        'awayGoals'    => $m['away_goals'] !== null ? (int) $m['away_goals'] : null,
    ];
}

json_out(['round' => $roundName, 'roundId' => $roundId, 'matches' => $matches]);
