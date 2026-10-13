<?php
/**
 * BYR DT — ranking. ?scope=fecha (la fecha en curso —si todavía no arrancó,
 * los equipos confirmados con 0 puntos—, o la última cerrada,
 * o ?round=ID) o ?scope=general (suma de todas las fechas).
 */
require_once __DIR__ . '/lib.php';

$userId = require_auth();
$pdo    = db();
byr_dt_require_ready($pdo);
byr_dt_ensure_lock($pdo);

$t      = byr_dt_team_of($pdo, $userId);
$teamId = $t ? (int) $t['id'] : null;
$scope  = ($_GET['scope'] ?? 'fecha') === 'general' ? 'general' : 'fecha';

$round = null;
if ($scope === 'fecha') {
    $rid = (int) ($_GET['round'] ?? 0);
    if ($rid) {
        $st = $pdo->prepare("SELECT * FROM dt_rounds WHERE id = ? AND status <> 'open'");
        $st->execute([$rid]);
        $round = $st->fetch() ?: null;
    } else {
        /* La fecha en curso (abierta o en juego); si no hay, la última cerrada. */
        $cur   = byr_dt_current_round($pdo);
        $round = $cur ?: byr_dt_last_closed_round($pdo);
    }
    if (!$round) {
        json_out(['ok' => true, 'round' => null, 'rows' => [], 'me' => null, 'total' => 0]);
    }
}

$isOpen = $round && $round['status'] === 'open';
$r = byr_dt_ranking($pdo, $scope, $round ? (int) $round['id'] : null, $teamId, 50, $isOpen);
json_out(['ok' => true, 'round' => byr_dt_round_public($round), 'rows' => $r['rows'], 'me' => $r['me'], 'total' => $r['total']]);
