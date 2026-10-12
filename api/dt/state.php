<?php
/**
 * BYR DT — todo lo que la pantalla del socio necesita de una vez:
 * la fecha en juego, su equipo y plantel, cambios disponibles, sus puntos
 * de la última fecha (con el detalle por jugador) y su lugar en el ranking.
 */
require_once __DIR__ . '/lib.php';

$userId = require_auth();
$pdo    = db();
byr_dt_require_ready($pdo);
byr_dt_ensure_lock($pdo);

$round = byr_dt_current_round($pdo);
$last  = byr_dt_last_closed_round($pdo);

$t     = byr_dt_team_of($pdo, $userId);
$team  = $t ? byr_dt_team_public($t) : null;
$squad = $t ? byr_dt_squad($pdo, (int) $t['id']) : [];

/* Puntos: la fecha en juego si ya arrancó; si no, la última cerrada. */
$scoreRound = ($round && $round['status'] === 'live') ? $round : $last;
$myPoints   = null;
if ($t && $scoreRound) {
    $tr = $pdo->prepare('SELECT points FROM dt_team_rounds WHERE round_id = ? AND team_id = ?');
    $tr->execute([(int) $scoreRound['id'], (int) $t['id']]);
    $pts = $tr->fetchColumn();

    if ($pts !== false) {
        /* Detalle por jugador del once que puntuó. */
        $lu = $pdo->prepare(
            'SELECT l.player_id, l.position, l.starter, l.captain, p.name, p.club_id
               FROM dt_lineups l JOIN dt_players p ON p.id = l.player_id
              WHERE l.round_id = ? AND l.team_id = ?'
        );
        $lu->execute([(int) $scoreRound['id'], (int) $t['id']]);
        $lineup = $lu->fetchAll();

        $sc = $pdo->prepare('SELECT * FROM dt_scores WHERE round_id = ?');
        $sc->execute([(int) $scoreRound['id']]);
        $scores = [];
        foreach ($sc->fetchAll() as $s) {
            $scores[(int) $s['player_id']] = $s;
        }
        $res = byr_dt_team_points($lineup, $scores);

        $detail = [];
        foreach ($lineup as $l) {
            $pid = (int) $l['player_id'];
            if (!array_key_exists($pid, $res['used'])) {
                continue;
            }
            $s = $scores[$pid] ?? null;
            $bits = [];
            if ($s) {
                $bits[] = (int) $s['minutes'] . ' min';
                if ((int) $s['goals'])   { $bits[] = (int) $s['goals'] . ((int) $s['goals'] === 1 ? ' gol' : ' goles'); }
                if ((int) $s['assists']) { $bits[] = (int) $s['assists'] . ((int) $s['assists'] === 1 ? ' asistencia' : ' asistencias'); }
                if ((int) $s['clean_sheet'] && in_array($l['position'], ['ARQ', 'DEF'], true) && (int) $s['minutes'] >= 60) { $bits[] = 'valla invicta'; }
                if ((int) $s['pen_saved']) { $bits[] = 'atajó penal'; }
                if ((int) $s['yellow'])  { $bits[] = 'amarilla'; }
                if ((int) $s['red'])     { $bits[] = 'roja'; }
                if ((int) $s['own_goals']) { $bits[] = 'gol en contra'; }
                if ($s['rating'] !== null) { $bits[] = 'nota ' . str_replace('.', ',', rtrim(rtrim((string) $s['rating'], '0'), '.')); }
            }
            $detail[] = [
                'playerId' => $pid,
                'name'     => $l['name'],
                'pos'      => $l['position'],
                'captain'  => (bool) $l['captain'],
                'sub'      => !(int) $l['starter'],     // entró desde el banco
                'detail'   => implode(' · ', $bits),
                'points'   => $res['used'][$pid],
            ];
        }
        usort($detail, fn($a, $b) => $b['points'] <=> $a['points']);

        $rank = byr_dt_ranking($pdo, 'fecha', (int) $scoreRound['id'], (int) $t['id'], 0);
        $myPoints = [
            'round'  => byr_dt_round_public($scoreRound),
            'points' => (int) $pts,
            'pos'    => $rank['me']['pos'] ?? null,
            'of'     => $rank['total'],
            'detail' => $detail,
        ];
    }
}

$general = $t ? byr_dt_ranking($pdo, 'general', null, (int) $t['id'], 0) : ['me' => null, 'total' => 0];

/* ¿Tiene que confirmar el equipo para la fecha abierta? */
$needsConfirm = false;
if ($round && $round['status'] === 'open') {
    /* El equipo pasa de una fecha a la otra: solo hace falta confirmar
       si nunca lo completó. */
    $needsConfirm = !$t || count($squad) < 15 || !$t['saved_at'];
}

/* Ganador de la última fecha cerrada (para el aviso y la pantalla). */
$winner = null;
if ($last && $last['winner_team_id']) {
    $w = $pdo->prepare(
        'SELECT t.id, t.name, t.crest, u.name AS user_name, tr.points
           FROM dt_teams t JOIN users u ON u.id = t.user_id
           JOIN dt_team_rounds tr ON tr.team_id = t.id AND tr.round_id = ?
          WHERE t.id = ?'
    );
    $w->execute([(int) $last['id'], (int) $last['winner_team_id']]);
    if ($row = $w->fetch()) {
        $winner = [
            'roundId'  => (int) $last['id'],
            'round'    => $last['name'],
            'teamId'   => (int) $row['id'],
            'team'     => $row['name'],
            'initials' => byr_dt_initials($row['name']),
            'crest'    => byr_dt_crest_url($row['crest']),
            'dt'       => byr_dt_dt_name((string) $row['user_name']),
            'points'   => (int) $row['points'],
            'isMe'     => $t && (int) $row['id'] === (int) $t['id'],
            'code'     => ($t && (int) $row['id'] === (int) $t['id']) ? $last['winner_code'] : null,
        ];
    }
}

$un = $pdo->prepare('SELECT name FROM users WHERE id = ?');
$un->execute([$userId]);

json_out([
    'ok'           => true,
    'me'           => ['dt' => byr_dt_dt_name((string) $un->fetchColumn())],
    'round'        => byr_dt_round_public($round),
    'canEdit'      => $round && $round['status'] === 'open',
    'team'         => $team,
    'squad'        => $squad,
    'transfers'    => $t ? byr_dt_transfers_used($pdo, (int) $t['id']) : ['limited' => false, 'used' => 0, 'left' => null],
    'needsConfirm' => $needsConfirm,
    'myPoints'     => $myPoints,
    'general'      => ['pos' => $general['me']['pos'] ?? null, 'points' => $general['me']['points'] ?? 0, 'of' => $general['total']],
    'winner'       => $winner,
    'rules'        => [
        'budget'     => BYR_DT_BUDGET,
        'squad'      => BYR_DT_SQUAD,
        'formations' => BYR_DT_FORMATIONS,
        'maxPerClub' => BYR_DT_MAX_PER_CLUB,
        'transfers'  => BYR_DT_TRANSFERS,
        'prize'      => BYR_DT_PRIZE,
    ],
]);
