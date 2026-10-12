<?php
/**
 * ADMIN — BYR DT: cerrar la fecha en juego.
 *
 *  - Hace falta que estén jugados todos los partidos. Los suspendidos o
 *    postergados no cuentan: la fecha se cierra sin ellos.
 *  - Ganador: más puntos; empate → más puntos con el capitán; si sigue el
 *    empate, el que confirmó el equipo antes. Se le genera el cupón de la
 *    Doble Cheese con papas (como el del Prode).
 *  - Mueve los precios: rendimiento en la fecha + demanda (cuántos equipos
 *    lo compraron o vendieron para esta fecha). Tope ±$0,5 M.
 *
 * Body JSON: { force?: true } → cerrar aunque falten partidos (los que
 * falten quedan sin contar, como si se hubieran suspendido).
 */
require_once __DIR__ . '/../dt/lib.php';
require_method('POST');

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);
byr_dt_ensure_lock($pdo);

$round = byr_dt_current_round($pdo);
if (!$round || $round['status'] !== 'live') {
    json_out(['error' => 'No hay una fecha en juego para cerrar.'], 409);
}
$roundId = (int) $round['id'];
$force   = !empty(body_json()['force']);

$done = "'" . implode("','", BYR_DT_DONE_STATUS) . "'";
$void = "'" . implode("','", BYR_DT_VOID_STATUS) . "'";
$pending = (int) $pdo->query("SELECT COUNT(*) FROM dt_fixtures WHERE round_id = $roundId AND status NOT IN ($done) AND status NOT IN ($void)")->fetchColumn();
$unscored = (int) $pdo->query("SELECT COUNT(*) FROM dt_fixtures WHERE round_id = $roundId AND status IN ($done) AND scored = 0")->fetchColumn();

if ($unscored) {
    json_out(['error' => "Hay $unscored partidos terminados sin puntajes. Tocá \"Sincronizar puntajes\" primero."], 409);
}
if ($pending && !$force) {
    json_out(['error' => "Faltan jugarse $pending partidos. Si están suspendidos o postergados, cerrá igual con \"Cerrar sin esos partidos\".", 'code' => 'pending', 'pending' => $pending], 409);
}

byr_dt_recompute_round($pdo, $roundId);

$pdo->beginTransaction();
try {
    /* Ganador. */
    $top = $pdo->prepare(
        'SELECT tr.team_id, tr.points, t.user_id
           FROM dt_team_rounds tr JOIN dt_teams t ON t.id = tr.team_id
          WHERE tr.round_id = ?
          ORDER BY tr.points DESC, tr.captain_points DESC, tr.saved_at IS NULL, tr.saved_at ASC, tr.team_id ASC
          LIMIT 1'
    );
    $top->execute([$roundId]);
    $best = $top->fetch();

    $winnerTeam = null;
    $code = null;
    if ($best && (int) $best['points'] > 0) {
        $winnerTeam = (int) $best['team_id'];
        $code = byr_generate_redemption_code($pdo);
        $pdo->prepare(
            'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, expires_at)
             VALUES (?, ?, ?, ?, "BYR DT", "pending", DATE_ADD(NOW(), INTERVAL ? HOUR))'
        )->execute([(int) $best['user_id'], $code, BYR_DT_PRIZE_ID, BYR_DT_PRIZE . ' · Ganador BYR DT ' . $round['name'], BYR_REDEMPTION_TTL_HOURS_SPECIAL]);
    }

    /* Precios. Demanda = equipos que lo tienen en esta fecha − en la anterior. */
    $prev = $pdo->prepare('SELECT MAX(id) FROM dt_rounds WHERE id < ? AND status = "closed"');
    $prev->execute([$roundId]);
    $prevId = (int) $prev->fetchColumn();

    $own = function (int $rid) use ($pdo): array {
        $out = [];
        if (!$rid) {
            return $out;
        }
        $st = $pdo->prepare('SELECT player_id, COUNT(*) n FROM dt_lineups WHERE round_id = ? GROUP BY player_id');
        $st->execute([$rid]);
        foreach ($st->fetchAll() as $r) {
            $out[(int) $r['player_id']] = (int) $r['n'];
        }
        return $out;
    };
    $nowOwn  = $own($roundId);
    $prevOwn = $prevId ? $own($prevId) : [];
    $teams   = (int) $pdo->query("SELECT COUNT(DISTINCT team_id) FROM dt_lineups WHERE round_id = $roundId")->fetchColumn();

    $pts = [];
    $st = $pdo->prepare('SELECT player_id, points, minutes FROM dt_scores WHERE round_id = ?');
    $st->execute([$roundId]);
    foreach ($st->fetchAll() as $r) {
        $pts[(int) $r['player_id']] = (int) $r['minutes'] > 0 ? (int) $r['points'] : null;
    }

    /* Clubes que jugaron esta fecha: a un jugador de un club que no jugó
       (partido suspendido, o eliminado en playoffs) no se le baja el precio. */
    $played = [];
    foreach ($pdo->query("SELECT home_id, away_id FROM dt_fixtures WHERE round_id = $roundId AND status IN ($done)") as $f) {
        $played[(int) $f['home_id']] = true;
        $played[(int) $f['away_id']] = true;
    }

    $upd = $pdo->prepare('UPDATE dt_players SET price = ? WHERE id = ?');
    $changed = 0;
    foreach ($pdo->query('SELECT id, club_id, price FROM dt_players WHERE active = 1 AND price > 0 AND price_locked = 0') as $p) {
        $id = (int) $p['id'];
        if (!isset($played[(int) $p['club_id']]) && !isset($nowOwn[$id]) && !isset($prevOwn[$id])) {
            continue;
        }
        $perf  = isset($played[(int) $p['club_id']]) ? ($pts[$id] ?? null) : 4;   // club sin partido: neutro
        $delta = byr_dt_price_delta($perf, ($nowOwn[$id] ?? 0) - ($prevOwn[$id] ?? 0), $teams);
        $new   = max(BYR_DT_PRICE_MIN, min(BYR_DT_PRICE_MAX, (int) $p['price'] + $delta));
        if ($new !== (int) $p['price']) {
            $upd->execute([$new, $id]);
            $changed++;
        }
    }

    $pdo->prepare("UPDATE dt_rounds SET status = 'closed', winner_team_id = ?, winner_code = ?, closed_at = UTC_TIMESTAMP() WHERE id = ?")
        ->execute([$winnerTeam, $code, $roundId]);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'No se pudo cerrar la fecha: ' . $e->getMessage()], 500);
}

$winner = null;
if ($winnerTeam) {
    $w = $pdo->prepare('SELECT t.name, u.name AS user_name FROM dt_teams t JOIN users u ON u.id = t.user_id WHERE t.id = ?');
    $w->execute([$winnerTeam]);
    $row = $w->fetch();
    $winner = ['team' => $row['name'], 'dt' => byr_dt_dt_name((string) $row['user_name']), 'points' => (int) $best['points'], 'code' => $code];
}

json_out(['ok' => true, 'winner' => $winner, 'pricesChanged' => $changed]);
