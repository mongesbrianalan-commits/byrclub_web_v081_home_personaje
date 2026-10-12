<?php
/**
 * ADMIN — BYR DT: ver y corregir a mano el puntaje de un jugador en la
 * fecha en juego (o en la última cerrada). Lo corregido a mano queda
 * marcado y la sincronización con la API ya no lo pisa.
 *
 * GET  ?q=texto                        → busca jugadores por nombre o club
 * GET  ?player=ID                      → su puntaje en la fecha
 * POST { player, minutes, goals, assists, yellow, red, own_goals,
 *        pen_missed, pen_saved, clean_sheet, rating }
 */
require_once __DIR__ . '/../dt/lib.php';

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);

$round = byr_dt_current_round($pdo);
if (!$round || $round['status'] === 'open') {
    $round = byr_dt_last_closed_round($pdo);
}
if (!$round) {
    json_out(['error' => 'Todavía no hay ninguna fecha jugada.'], 409);
}
$roundId = (int) $round['id'];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $q = trim((string) ($_GET['q'] ?? ''));
    if ($q !== '') {
        $st = $pdo->prepare(
            'SELECT p.id, p.name, p.position, c.short AS club FROM dt_players p LEFT JOIN dt_clubs c ON c.id = p.club_id
              WHERE p.name LIKE ? OR p.full_name LIKE ? OR c.name LIKE ? ORDER BY p.active DESC, p.price DESC LIMIT 15'
        );
        $like = '%' . $q . '%';
        $st->execute([$like, $like, $like]);
        json_out(['ok' => true, 'round' => $round['name'], 'players' => array_map(fn($r) => [
            'id' => (int) $r['id'], 'label' => $r['name'] . ' (' . ($r['club'] ?: '?') . ' · ' . $r['position'] . ')',
        ], $st->fetchAll())]);
    }
    $pid = (int) ($_GET['player'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM dt_scores WHERE round_id = ? AND player_id = ?');
    $st->execute([$roundId, $pid]);
    $s = $st->fetch() ?: null;
    json_out(['ok' => true, 'round' => $round['name'], 'score' => $s]);
}

require_method('POST');
$in  = body_json();
$pid = (int) ($in['player'] ?? 0);
$p   = $pdo->prepare('SELECT position FROM dt_players WHERE id = ?');
$p->execute([$pid]);
$pos = $p->fetchColumn();
if (!$pos) {
    json_out(['error' => 'No existe ese jugador.'], 404);
}

$n = fn($k, $max = 99) => max(0, min($max, (int) ($in[$k] ?? 0)));
$rating = isset($in['rating']) && $in['rating'] !== '' ? (float) str_replace(',', '.', (string) $in['rating']) : null;
if ($rating !== null && ($rating < 0 || $rating > 10)) {
    json_out(['error' => 'La nota va de 0 a 10.'], 422);
}
$s = [
    'minutes' => $n('minutes', 130), 'goals' => $n('goals', 10), 'assists' => $n('assists', 10),
    'yellow' => $n('yellow', 2), 'red' => $n('red', 1), 'own_goals' => $n('own_goals', 5),
    'pen_missed' => $n('pen_missed', 5), 'pen_saved' => $n('pen_saved', 5),
    'clean_sheet' => empty($in['clean_sheet']) ? 0 : 1, 'rating' => $rating,
];
$points = byr_dt_points($s, $pos);

$fx = $pdo->prepare('SELECT fixture_id FROM dt_scores WHERE round_id = ? AND player_id = ?');
$fx->execute([$roundId, $pid]);
$fixtureId = (int) ($fx->fetchColumn() ?: 0);

$pdo->prepare(
    'INSERT INTO dt_scores (round_id, player_id, fixture_id, minutes, goals, assists, yellow, red, own_goals, pen_missed, pen_saved, clean_sheet, rating, points, manual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE minutes = VALUES(minutes), goals = VALUES(goals), assists = VALUES(assists), yellow = VALUES(yellow),
        red = VALUES(red), own_goals = VALUES(own_goals), pen_missed = VALUES(pen_missed), pen_saved = VALUES(pen_saved),
        clean_sheet = VALUES(clean_sheet), rating = VALUES(rating), points = VALUES(points), manual = 1'
)->execute([$roundId, $pid, $fixtureId, $s['minutes'], $s['goals'], $s['assists'], $s['yellow'], $s['red'], $s['own_goals'],
            $s['pen_missed'], $s['pen_saved'], $s['clean_sheet'], $s['rating'], $points]);

byr_dt_recompute_round($pdo, $roundId);
json_out(['ok' => true, 'points' => $points, 'round' => $round['name']]);
