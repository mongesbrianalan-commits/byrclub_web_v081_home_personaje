<?php
/**
 * Guarda (o actualiza) el pronóstico de un socio para un partido.
 * Solo se permite mientras el partido no arrancó (bloqueo por horario,
 * en tiempo absoluto UTC). Un pronóstico por socio y partido.
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$in      = body_json();
$matchId = (int) ($in['matchId'] ?? 0);
$home    = $in['home'] ?? null;
$away    = $in['away'] ?? null;

if ($matchId <= 0 || $home === null || $away === null || !is_numeric($home) || !is_numeric($away)) {
    json_out(['error' => 'Cargá ambos resultados.'], 422);
}
$home = (int) $home;
$away = (int) $away;
if ($home < 0 || $away < 0 || $home > 30 || $away > 30) {
    json_out(['error' => 'Resultado inválido.'], 422);
}

$stmt = $pdo->prepare('SELECT id, kickoff, status FROM prode_matches WHERE id = ?');
$stmt->execute([$matchId]);
$match = $stmt->fetch();
if (!$match) {
    json_out(['error' => 'Ese partido no existe.', 'code' => 'not-found'], 404);
}
if ($match['status'] === 'finished' || byr_prode_is_locked($match['kickoff'])) {
    json_out(['error' => 'Ese partido ya arrancó, no se puede pronosticar.', 'code' => 'locked'], 409);
}

$stmt = $pdo->prepare(
    'INSERT INTO prode_predictions (user_id, match_id, home_pred, away_pred)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE home_pred = VALUES(home_pred), away_pred = VALUES(away_pred)'
);
$stmt->execute([$id, $matchId, $home, $away]);

json_out(['ok' => true, 'prediction' => ['home' => $home, 'away' => $away]]);
