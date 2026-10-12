<?php
/**
 * BYR DT — ranking. ?scope=fecha (la fecha en juego o la última cerrada,
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
        $cur   = byr_dt_current_round($pdo);
        $round = ($cur && $cur['status'] === 'live') ? $cur : byr_dt_last_closed_round($pdo);
    }
    if (!$round) {
        json_out(['ok' => true, 'round' => null, 'rows' => [], 'me' => null, 'total' => 0]);
    }
}

$r = byr_dt_ranking($pdo, $scope, $round ? (int) $round['id'] : null, $teamId, 50);
json_out(['ok' => true, 'round' => byr_dt_round_public($round), 'rows' => $r['rows'], 'me' => $r['me'], 'total' => $r['total']]);
