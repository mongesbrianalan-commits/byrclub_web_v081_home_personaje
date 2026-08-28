<?php
/**
 * ADMIN — Borra un partido de una fecha (cuando se cargó mal o no va).
 *
 * Va en dos pasos para no borrar sin querer:
 *   - sin `confirm` → devuelve el partido y cuántos pronósticos se llevaría
 *     puestos, para mostrarlo antes de confirmar.
 *   - con `confirm: true` → borra. Los pronósticos se van solos por la FK
 *     (fk_pred_match ... ON DELETE CASCADE).
 *
 * Ojo: si el partido ya estaba jugado y puntuado, la XP que se repartió en su
 * momento NO se devuelve (ya está sumada en el perfil de cada socio). Por eso
 * el preview avisa cuántos pronósticos tenían puntos.
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
$confirm = !empty($in['confirm']);

if ($matchId <= 0) {
    json_out(['error' => 'Falta el ID del partido.'], 422);
}

$stmt = $pdo->prepare(
    'SELECT id, round_id, home_team, away_team, kickoff, status FROM prode_matches WHERE id = ?'
);
$stmt->execute([$matchId]);
$match = $stmt->fetch();
if (!$match) {
    json_out(['error' => 'Ese partido no existe (puede que ya lo hayas borrado).'], 404);
}

/* Cuántos pronósticos se van con él, y cuántos ya habían puntuado. */
$stmt = $pdo->prepare(
    'SELECT COUNT(*) AS total, SUM(points IS NOT NULL) AS scored
       FROM prode_predictions WHERE match_id = ?'
);
$stmt->execute([$matchId]);
$counts = $stmt->fetch();
$preds  = (int) ($counts['total'] ?? 0);
$scored = (int) ($counts['scored'] ?? 0);

if (!$confirm) {
    json_out([
        'preview'      => true,
        'matchId'      => (int) $match['id'],
        'home'         => $match['home_team'],
        'away'         => $match['away_team'],
        'kickoffLabel' => byr_prode_kickoff_label($match['kickoff']),
        'status'       => $match['status'],
        'preds'        => $preds,
        'scored'       => $scored,
    ]);
}

$pdo->prepare('DELETE FROM prode_matches WHERE id = ?')->execute([$matchId]);

json_out([
    'ok'      => true,
    'matchId' => $matchId,
    'roundId' => (int) $match['round_id'],
    'home'    => $match['home_team'],
    'away'    => $match['away_team'],
    'preds'   => $preds,
    'scored'  => $scored,
]);
