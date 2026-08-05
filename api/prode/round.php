<?php
/**
 * Fecha actual del Prode + los pronósticos del socio que consulta.
 * Toma la fecha "open" más reciente (o la última si no hay ninguna abierta).
 * Devuelve cada partido con: horario (hora Argentina), si está bloqueado
 * (ya arrancó), el resultado si se jugó, y el pronóstico del socio.
 */
require_once __DIR__ . '/lib.php';

$id  = require_auth();
$pdo = db();

/* Tomamos la fecha más reciente que TENGA partidos (así una fecha vacía que
   haya quedado creada por error no tapa a la que sí tiene partidos). Se
   priorizan las abiertas y, dentro de esas, la de id más alto. */
$round = $pdo->query(
    "SELECT r.* FROM prode_rounds r
      WHERE EXISTS (SELECT 1 FROM prode_matches m WHERE m.round_id = r.id)
      ORDER BY (r.status = 'open') DESC, r.id DESC
      LIMIT 1"
)->fetch();

if (!$round) {
    json_out(['round' => null, 'matches' => [], 'you' => null]);
}

$stmt = $pdo->prepare(
    "SELECT m.*, p.home_pred, p.away_pred, p.points AS pred_points
       FROM prode_matches m
       LEFT JOIN prode_predictions p ON p.match_id = m.id AND p.user_id = ?
      WHERE m.round_id = ?
      ORDER BY m.kickoff ASC, m.id ASC"
);
$stmt->execute([$id, (int) $round['id']]);
$rows = $stmt->fetchAll();

$matches   = [];
$roundPts  = 0;
$hits      = 0;
$predicted = 0;

foreach ($rows as $r) {
    $kickoffUtc = $r['kickoff'];
    $hasPred    = ($r['home_pred'] !== null && $r['away_pred'] !== null);
    $finished   = ($r['status'] === 'finished');

    if ($hasPred) {
        $predicted++;
    }
    if ($r['pred_points'] !== null) {
        $roundPts += (int) $r['pred_points'];
        if ((int) $r['pred_points'] === 10) {
            $hits++;
        }
    }

    $matches[] = [
        'id'          => (int) $r['id'],
        'home'        => $r['home_team'],
        'away'        => $r['away_team'],
        'homeLogo'    => $r['home_logo'],
        'awayLogo'    => $r['away_logo'],
        'kickoffUtc'  => gmdate('c', strtotime($kickoffUtc . ' UTC')),
        'kickoffLabel'=> byr_prode_kickoff_label($kickoffUtc),
        'status'      => $r['status'],
        'locked'      => $finished || byr_prode_is_locked($kickoffUtc),
        'homeGoals'   => $finished ? (int) $r['home_goals'] : null,
        'awayGoals'   => $finished ? (int) $r['away_goals'] : null,
        'prediction'  => $hasPred ? [
            'home'   => (int) $r['home_pred'],
            'away'   => (int) $r['away_pred'],
            'points' => $r['pred_points'] !== null ? (int) $r['pred_points'] : null,
        ] : null,
    ];
}

json_out([
    'round' => [
        'id'          => (int) $round['id'],
        'name'        => $round['name'],
        'competition' => $round['competition'],
        'season'      => (int) $round['season'],
        'status'      => $round['status'],
    ],
    'matches' => $matches,
    'you' => [
        'points'    => $roundPts,   // puntos del socio en esta fecha
        'hits'      => $hits,       // resultados exactos
        'predicted' => $predicted,  // partidos pronosticados
        'total'     => count($matches),
    ],
]);
