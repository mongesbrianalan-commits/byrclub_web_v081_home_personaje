<?php
/**
 * ADMIN — Carga el resultado de un partido A MANO. Marca el partido como
 * jugado, puntúa todos los pronósticos (🎯10 / ✅5 / ❌0) y, si ya se
 * jugaron todos los de la fecha, la cierra y premia al ganador.
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
$matchId = (int) ($in['matchId'] ?? 0);
$home    = $in['homeGoals'] ?? null;
$away    = $in['awayGoals'] ?? null;

if ($matchId <= 0 || $home === null || $away === null || !is_numeric($home) || !is_numeric($away)) {
    json_out(['error' => 'Cargá los goles de ambos equipos.'], 422);
}
$home = (int) $home;
$away = (int) $away;
if ($home < 0 || $away < 0 || $home > 50 || $away > 50) {
    json_out(['error' => 'Resultado inválido.'], 422);
}

$stmt = $pdo->prepare('SELECT id, round_id FROM prode_matches WHERE id = ?');
$stmt->execute([$matchId]);
$match = $stmt->fetch();
if (!$match) {
    json_out(['error' => 'Ese partido no existe.'], 404);
}

$pdo->prepare('UPDATE prode_matches SET status = "finished", home_goals = ?, away_goals = ? WHERE id = ?')
    ->execute([$home, $away, $matchId]);

$scored = byr_prode_score_match($pdo, $matchId, $home, $away);
$closed = byr_prode_close_round_if_complete($pdo, (int) $match['round_id']);

json_out([
    'ok'          => true,
    'scored'      => $scored,
    'roundClosed' => $closed['closed'],
    'winner'      => $closed['winner'],
]);
