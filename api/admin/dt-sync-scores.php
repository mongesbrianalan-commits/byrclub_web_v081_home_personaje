<?php
/**
 * ADMIN — BYR DT: actualizar la fecha en juego desde la API.
 *
 *  1. Refresca los partidos (horario, estado, resultado). Con la fecha
 *     todavía abierta, corrige el horario de cierre si cambió el primer
 *     partido (la AFA suele confirmar horarios tarde).
 *  2. Con la fecha en juego, trae los puntajes de los partidos terminados
 *     que falten, de a 6 por pedido (el panel repite hasta terminar).
 *     Un puntaje corregido a mano no se pisa.
 *  3. Recalcula los puntos de todos los equipos.
 *
 * Body JSON: { force?: true }  → vuelve a traer también los ya cargados.
 */
require_once __DIR__ . '/../dt/lib.php';
require_method('POST');

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);
@set_time_limit(60);
byr_dt_ensure_lock($pdo);

$round = byr_dt_current_round($pdo);
if (!$round) {
    json_out(['error' => 'No hay ninguna fecha en juego.'], 409);
}
$roundId = (int) $round['id'];
$force   = !empty(body_json()['force']);

try {
    /* 1) Partidos. */
    $fx = byr_apifootball_get('fixtures', ['league' => byr_prode_league(), 'season' => byr_prode_season(), 'round' => $round['api_round']]);
    $up = $pdo->prepare('UPDATE dt_fixtures SET kickoff = ?, status = ?, home_goals = ?, away_goals = ? WHERE id = ? AND round_id = ?');
    foreach ($fx as $f) {
        $up->execute([
            gmdate('Y-m-d H:i:s', strtotime($f['fixture']['date'])),
            $f['fixture']['status']['short'] ?? 'NS',
            $f['goals']['home'], $f['goals']['away'],
            (int) $f['fixture']['id'], $roundId,
        ]);
    }

    if ($round['status'] === 'open') {
        $void = "'" . implode("','", BYR_DT_VOID_STATUS) . "'";
        $first = $pdo->query("SELECT MIN(kickoff) FROM dt_fixtures WHERE round_id = $roundId AND status NOT IN ($void)")->fetchColumn();
        if ($first && $first !== $round['deadline']) {
            $pdo->prepare('UPDATE dt_rounds SET deadline = ? WHERE id = ?')->execute([$first, $roundId]);
        }
        byr_dt_ensure_lock($pdo);
        $round = byr_dt_current_round($pdo);
        if ($round['status'] === 'open') {
            json_out(['ok' => true, 'done' => 'Horarios actualizados. La fecha cierra ' . byr_dt_when($round['deadline']) . '.', 'remaining' => 0]);
        }
    }

    /* 2) Puntajes de los partidos terminados. */
    $done = "'" . implode("','", BYR_DT_DONE_STATUS) . "'";
    $sql  = "SELECT id FROM dt_fixtures WHERE round_id = $roundId AND status IN ($done)" . ($force ? '' : ' AND scored = 0') . ' ORDER BY kickoff';
    $todo = $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN);
    $batch = array_slice($todo, 0, 6);

    $pos = [];
    foreach ($pdo->query('SELECT id, position FROM dt_players') as $p) {
        $pos[(int) $p['id']] = $p['position'];
    }

    $ins = $pdo->prepare(
        'INSERT INTO dt_scores (round_id, player_id, fixture_id, minutes, goals, assists, yellow, red, own_goals, pen_missed, pen_saved, clean_sheet, rating, points)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            fixture_id = IF(manual = 1, fixture_id, VALUES(fixture_id)),
            minutes = IF(manual = 1, minutes, VALUES(minutes)), goals = IF(manual = 1, goals, VALUES(goals)),
            assists = IF(manual = 1, assists, VALUES(assists)), yellow = IF(manual = 1, yellow, VALUES(yellow)),
            red = IF(manual = 1, red, VALUES(red)), own_goals = IF(manual = 1, own_goals, VALUES(own_goals)),
            pen_missed = IF(manual = 1, pen_missed, VALUES(pen_missed)), pen_saved = IF(manual = 1, pen_saved, VALUES(pen_saved)),
            clean_sheet = IF(manual = 1, clean_sheet, VALUES(clean_sheet)), rating = IF(manual = 1, rating, VALUES(rating)),
            points = IF(manual = 1, points, VALUES(points))'
    );
    $mark = $pdo->prepare('UPDATE dt_fixtures SET scored = 1 WHERE id = ?');

    foreach ($batch as $fixtureId) {
        $res = byr_apifootball_get('fixtures', ['id' => (int) $fixtureId]);
        if (!$res) {
            continue;
        }
        foreach (byr_dt_parse_fixture($res[0]) as $pid => $s) {
            if (!isset($pos[$pid])) {
                continue;            // jugador que no está en el juego
            }
            $ins->execute([
                $roundId, $pid, (int) $fixtureId, $s['minutes'], $s['goals'], $s['assists'], $s['yellow'], $s['red'],
                $s['own_goals'], $s['pen_missed'], $s['pen_saved'], $s['clean_sheet'], $s['rating'],
                byr_dt_points($s, $pos[$pid]),
            ]);
        }
        $mark->execute([(int) $fixtureId]);
    }
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 502);
}

/* 3) Puntos de los equipos. */
byr_dt_recompute_round($pdo, $roundId);

$remaining = count($todo) - count($batch);
$pending   = (int) $pdo->query(
    "SELECT COUNT(*) FROM dt_fixtures WHERE round_id = $roundId AND status NOT IN ($done) AND status NOT IN ('" . implode("','", BYR_DT_VOID_STATUS) . "')"
)->fetchColumn();

json_out([
    'ok'        => true,
    'done'      => count($batch) . ' partidos puntuados' . ($pending ? " · faltan jugarse $pending" : ' · se jugaron todos'),
    'remaining' => $remaining,
    'pending'   => $pending,
]);
