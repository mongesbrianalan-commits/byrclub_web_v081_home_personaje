<?php
/**
 * BYR DT — la ficha de un jugador antes de ficharlo: cómo viene.
 *
 * GET ?id=123 → { ok, next, stats: [ { icon, title, text, tone } ] }
 *
 *   1. Cómo viene su club: "Viene de ganar 2-1 a Boca" + los últimos resultados.
 *   2. Cómo le fue a él en ese partido: amarilla, roja, gol, no jugó…
 *   3. Sus números en el torneo: goles, asistencias, nota, minutos.
 *   (el promedio de puntos y el % que lo tiene ya los tiene el navegador)
 *
 * Todo sale de lo que ya está cargado (dt_fixtures / dt_scores / dt_players):
 * no consulta a API-Football, así que es instantáneo y no gasta pedidos.
 * Un partido que el juego no trajo no se conoce: en ese caso la línea no sale.
 */
require_once __DIR__ . '/lib.php';

require_auth();
$pdo = db();
byr_dt_require_ready($pdo);

$id = (int) ($_GET['id'] ?? 0);
$st = $pdo->prepare(
    'SELECT p.*, c.name AS club_name FROM dt_players p LEFT JOIN dt_clubs c ON c.id = p.club_id WHERE p.id = ?'
);
$st->execute([$id]);
$p = $st->fetch();
if (!$p) {
    json_out(['error' => 'No encontramos a ese jugador.'], 404);
}
$clubId = (int) $p['club_id'];
$stats  = [];

/* --- 1. Cómo viene el club ------------------------------------------------ */
$done = "'" . implode("','", BYR_DT_DONE_STATUS) . "'";
$fx = $pdo->prepare(
    "SELECT * FROM dt_fixtures
      WHERE (home_id = ? OR away_id = ?) AND status IN ($done) AND home_goals IS NOT NULL
      ORDER BY kickoff DESC LIMIT 5"
);
$fx->execute([$clubId, $clubId]);
$last = $fx->fetchAll();

$form = [];
foreach ($last as $f) {
    $home  = (int) $f['home_id'] === $clubId;
    $mine  = (int) ($home ? $f['home_goals'] : $f['away_goals']);
    $their = (int) ($home ? $f['away_goals'] : $f['home_goals']);
    $form[] = $mine > $their ? 'G' : ($mine < $their ? 'P' : 'E');
}

if ($last) {
    $f     = $last[0];
    $home  = (int) $f['home_id'] === $clubId;
    $mine  = (int) ($home ? $f['home_goals'] : $f['away_goals']);
    $their = (int) ($home ? $f['away_goals'] : $f['home_goals']);
    $rival = $home ? $f['away_name'] : $f['home_name'];
    $score = "$mine-$their";

    if ($mine > $their) {
        $stats[] = ['icon' => '📈', 'tone' => 'good', 'title' => 'Viene de ganar',
                    'text' => "$score a $rival · últimos: " . implode(' ', $form)];
    } elseif ($mine < $their) {
        $stats[] = ['icon' => '📉', 'tone' => 'bad', 'title' => 'Viene de perder',
                    'text' => "$score con $rival · últimos: " . implode(' ', $form)];
    } else {
        $stats[] = ['icon' => '🤝', 'tone' => '', 'title' => 'Viene de empatar',
                    'text' => "$score con $rival · últimos: " . implode(' ', $form)];
    }

    /* --- 2. Cómo le fue a él en ese partido ------------------------------- */
    $sc = $pdo->prepare('SELECT * FROM dt_scores WHERE player_id = ? AND fixture_id = ?');
    $sc->execute([$id, (int) $f['id']]);
    $s = $sc->fetch();

    if ($s && (int) $s['minutes'] > 0) {
        $pts  = (int) $s['points'];
        $tail = (int) $s['minutes'] . "' jugados"
              . ($s['rating'] !== null ? ' · nota ' . str_replace('.', ',', rtrim(rtrim((string) $s['rating'], '0'), '.')) : '')
              . ' · ' . ($pts > 0 ? '+' : '') . $pts . ' pts';
        $g = (int) $s['goals'];
        $a = (int) $s['assists'];

        if ((int) $s['red'] > 0) {
            $stats[] = ['icon' => '🟥', 'tone' => 'bad', 'title' => 'Viene de una roja',
                        'text' => 'Puede estar suspendido · ' . $tail];
        } elseif ($g > 0) {
            $stats[] = ['icon' => '⚽', 'tone' => 'good', 'title' => $g === 1 ? 'Viene de hacer un gol' : "Viene de hacer $g goles",
                        'text' => ((int) $s['yellow'] > 0 ? 'Y vio la amarilla · ' : '') . $tail];
        } elseif ((int) $s['yellow'] > 0) {
            $stats[] = ['icon' => '🟨', 'tone' => 'warn', 'title' => 'Viene de una amarilla', 'text' => $tail];
        } elseif ($a > 0) {
            $stats[] = ['icon' => '🎯', 'tone' => 'good', 'title' => $a === 1 ? 'Viene de dar una asistencia' : "Viene de dar $a asistencias",
                        'text' => $tail];
        } elseif ((int) $s['clean_sheet'] > 0 && in_array($p['position'], ['ARQ', 'DEF'], true)) {
            $stats[] = ['icon' => '🧤', 'tone' => 'good', 'title' => 'Viene de valla invicta', 'text' => $tail];
        } else {
            $stats[] = ['icon' => '⏱️', 'tone' => '', 'title' => 'Jugó el último partido', 'text' => $tail];
        }
    } elseif ((int) $f['scored'] === 1) {
        /* El partido ya tiene puntajes y él no aparece: no entró. */
        $stats[] = ['icon' => '🪑', 'tone' => 'warn', 'title' => 'No jugó el último partido',
                    'text' => 'No sumó minutos contra ' . $rival];
    }
}

/* --- 3. Sus números en el torneo ------------------------------------------ */
$parts = [];
$goals = (int) $p['season_goals'];
$ast   = (int) $p['season_assists'];
if ($goals > 0) $parts[] = $goals . ($goals === 1 ? ' gol' : ' goles');
if ($ast > 0)   $parts[] = $ast . ($ast === 1 ? ' asistencia' : ' asistencias');
if ($p['season_rating'] !== null) $parts[] = 'nota ' . number_format((float) $p['season_rating'], 1, ',', '');
if ((int) $p['season_minutes'] > 0) $parts[] = number_format((int) $p['season_minutes'], 0, ',', '.') . "' jugados";
if ($parts) {
    $stats[] = ['icon' => '📊', 'tone' => '', 'title' => 'En el torneo', 'text' => implode(' · ', $parts)];
}

/* --- Próximo partido (el de la fecha que se está armando) ----------------- */
$next = null;
$nx = $pdo->prepare(
    "SELECT f.* FROM dt_fixtures f JOIN dt_rounds r ON r.id = f.round_id
      WHERE r.status <> 'closed' AND (f.home_id = ? OR f.away_id = ?) AND f.kickoff > ?
      ORDER BY f.kickoff ASC LIMIT 1"
);
$nx->execute([$clubId, $clubId, byr_dt_now()]);
if ($n = $nx->fetch()) {
    $home = (int) $n['home_id'] === $clubId;
    $next = 'Próximo: ' . ($home ? 'de local' : 'de visitante') . ' vs ' . ($home ? $n['away_name'] : $n['home_name'])
          . ' · ' . byr_dt_when($n['kickoff']);
}

json_out(['ok' => true, 'next' => $next, 'stats' => $stats]);
