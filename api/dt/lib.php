<?php
/**
 * BYR DT — el juego de armar tu equipo con jugadores de la Liga Profesional.
 *
 * Este archivo junta las reglas del juego. Las funciones "puras" (sin base de
 * datos) están arriba y se pueden probar sueltas: puntaje de un jugador,
 * precio inicial, movimiento de precio, validación del plantel y cambios
 * automáticos. Abajo, las que leen y escriben la base.
 *
 * Plata: todo va en DÉCIMAS DE MILLÓN (95 = $9,5 M) para no usar decimales.
 */

require_once __DIR__ . '/../prode/lib.php';   // config, cliente de API-Football

/* =========================================================================
   Reglas fijas
   ========================================================================= */

const BYR_DT_BUDGET          = 1000;   // $100 M
const BYR_DT_MAX_PER_CLUB    = 3;
const BYR_DT_TRANSFERS       = 3;      // cambios por fecha (desde la segunda)
const BYR_DT_PRICE_MIN       = 35;     // $3,5 M
const BYR_DT_PRICE_MAX       = 140;    // $14 M
const BYR_DT_PRICE_STEP_MAX  = 5;      // ±$0,5 M por fecha
const BYR_DT_SQUAD           = ['ARQ' => 2, 'DEF' => 5, 'MED' => 5, 'DEL' => 3];   // 15
const BYR_DT_FORMATIONS      = [
    '4-3-3' => ['ARQ' => 1, 'DEF' => 4, 'MED' => 3, 'DEL' => 3],
    '4-4-2' => ['ARQ' => 1, 'DEF' => 4, 'MED' => 4, 'DEL' => 2],
    '3-4-3' => ['ARQ' => 1, 'DEF' => 3, 'MED' => 4, 'DEL' => 3],
    '3-5-2' => ['ARQ' => 1, 'DEF' => 3, 'MED' => 5, 'DEL' => 2],
    '5-3-2' => ['ARQ' => 1, 'DEF' => 5, 'MED' => 3, 'DEL' => 2],
    '4-5-1' => ['ARQ' => 1, 'DEF' => 4, 'MED' => 5, 'DEL' => 1],
];
const BYR_DT_PRIZE_ID        = 'dt-winner';
const BYR_DT_PRIZE           = 'Doble Cheese con papas';

/** Estados de la API en los que el partido no se juega (no cuenta). */
const BYR_DT_VOID_STATUS     = ['PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP'];
/** Estados de partido terminado. */
const BYR_DT_DONE_STATUS     = ['FT', 'AET', 'PEN'];

/**
 * Colores de camiseta por club (id de API-Football): [camiseta, cuello, sigla].
 * Un club que no esté acá sale blanco con la sigla de la API.
 */
const BYR_DT_CLUB_STYLE = [
    434  => ['#ffffff', '#0b2a6f', 'GIM'],   // Gimnasia L.P.
    435  => ['#ffffff', '#e30613', 'RIV'],   // River
    436  => ['#7cc4f2', '#ffffff', 'RAC'],   // Racing
    437  => ['#0b3c9c', '#ffd51f', 'CEN'],   // Rosario Central
    438  => ['#ffffff', '#0b3c9c', 'VEL'],   // Vélez
    440  => ['#7cc4f2', '#03124a', 'BEL'],   // Belgrano
    441  => ['#e30613', '#ffffff', 'UNI'],   // Unión
    442  => ['#1f9a45', '#ffd51f', 'DYJ'],   // Defensa y Justicia
    445  => ['#ffffff', '#e30613', 'HUR'],   // Huracán
    446  => ['#7a1f2b', '#ffffff', 'LAN'],   // Lanús
    449  => ['#1f9a45', '#ffffff', 'BAN'],   // Banfield
    450  => ['#ffffff', '#e30613', 'EST'],   // Estudiantes L.P.
    451  => ['#0b3c9c', '#ffd51f', 'BOC'],   // Boca
    452  => ['#0b3c9c', '#e30613', 'TIG'],   // Tigre
    453  => ['#d4161c', '#ffffff', 'IND'],   // Independiente
    455  => ['#7cc4f2', '#ffffff', 'TUC'],   // Atlético Tucumán
    456  => ['#0b2a6f', '#ffffff', 'TAL'],   // Talleres
    457  => ['#d4161c', '#111111', 'NOB'],   // Newell's
    458  => ['#e30613', '#ffffff', 'ARG'],   // Argentinos
    460  => ['#0b2a6f', '#d4161c', 'SLO'],   // San Lorenzo
    463  => ['#1f9a45', '#ffd51f', 'ALD'],   // Aldosivi
    473  => ['#0b2a6f', '#ffffff', 'IRI'],   // Independiente Rivadavia
    474  => ['#ffd51f', '#1f9a45', 'SAR'],   // Sarmiento
    476  => ['#111111', '#ffffff', 'RIE'],   // Riestra
    478  => ['#e30613', '#ffffff', 'INS'],   // Instituto
    1064 => ['#5a3a22', '#ffffff', 'PLA'],   // Platense
    1065 => ['#111111', '#ffffff', 'CCO'],   // Central Córdoba (SdE)
    1066 => ['#ffffff', '#111111', 'GIM'],   // Gimnasia (Mendoza)
    2424 => ['#ffffff', '#1f9a45', 'ERC'],   // Estudiantes (Río Cuarto)
    2432 => ['#e30613', '#ffffff', 'BAR'],   // Barracas Central
];

/* =========================================================================
   Funciones puras (sin base de datos)
   ========================================================================= */

/** "Goalkeeper" / "G" → "ARQ" … null si no se entiende. */
function byr_dt_pos(string $api): ?string
{
    $k = strtoupper(substr(trim($api), 0, 1));
    return ['G' => 'ARQ', 'D' => 'DEF', 'M' => 'MED', 'F' => 'DEL', 'A' => 'DEL'][$k] ?? null;
}

/**
 * Puntos de un jugador en un partido (sin el ×2 del capitán).
 * $s: minutes, goals, assists, yellow, red, own_goals, pen_missed, pen_saved,
 *     clean_sheet (bool), rating (float|null).
 */
function byr_dt_points(array $s, string $pos): int
{
    $min = (int) ($s['minutes'] ?? 0);
    if ($min <= 0) {
        return 0;
    }
    $p = 0;
    if ($min >= 60) {
        $p += 2;
    }
    $perGoal = ['DEL' => 4, 'MED' => 5, 'DEF' => 6, 'ARQ' => 6][$pos] ?? 4;
    $p += $perGoal * (int) ($s['goals'] ?? 0);
    $p += 3 * (int) ($s['assists'] ?? 0);
    if (!empty($s['clean_sheet']) && $min >= 60 && ($pos === 'ARQ' || $pos === 'DEF')) {
        $p += 4;
    }
    $p += 5 * (int) ($s['pen_saved'] ?? 0);
    if (isset($s['rating']) && $s['rating'] !== null && (float) $s['rating'] >= 8.0) {
        $p += 3;
    }
    $p -= 1 * (int) ($s['yellow'] ?? 0);
    $p -= 3 * (int) ($s['red'] ?? 0);
    $p -= 2 * (int) ($s['own_goals'] ?? 0);
    $p -= 2 * (int) ($s['pen_missed'] ?? 0);
    return $p;
}

/**
 * Precio inicial según lo que viene haciendo en la temporada.
 * Tramos por puesto: [más barato, más caro].
 */
function byr_dt_initial_price(string $pos, ?float $rating, int $minutes, int $goals, int $assists): int
{
    $range = ['ARQ' => [40, 65], 'DEF' => [40, 70], 'MED' => [45, 90], 'DEL' => [50, 120]][$pos] ?? [45, 80];

    $r  = $rating ?: 6.3;
    $qr = max(0.0, min(1.0, ($r - 6.3) / 1.0));                 // nota: 6,3 → 0, 7,3 → 1

    $per90  = $minutes > 0 ? ($goals + $assists) / ($minutes / 90) : 0.0;
    $target = ['ARQ' => 0.05, 'DEF' => 0.15, 'MED' => 0.35, 'DEL' => 0.55][$pos] ?? 0.3;
    $qg     = max(0.0, min(1.0, $per90 / $target));

    $q = $pos === 'ARQ' ? $qr : (0.65 * $qr + 0.35 * $qg);

    /* Con pocos minutos no hay con qué medirlo: se acerca al piso. */
    if ($minutes < 450) {
        $q *= $minutes / 450;
    }

    $price = $range[0] + $q * ($range[1] - $range[0]);
    $price = (int) (round($price / 5) * 5);                      // de a $0,5 M
    return max(BYR_DT_PRICE_MIN, min(BYR_DT_PRICE_MAX, $price));
}

/**
 * Cuánto se mueve el precio después de una fecha (en décimas).
 * Rendimiento: 4 puntos es "lo normal". Demanda: compras menos ventas sobre
 * el total de equipos. Tope ±0,5 por fecha.
 */
function byr_dt_price_delta(?int $points, int $netTransfers, int $teams): int
{
    $perf = $points === null ? -1 : (int) round(max(-3, min(3, ($points - 4) / 2)));
    $demand = 0;
    if ($teams > 0) {
        $share  = $netTransfers / $teams;                           // ej: 0,10 = lo compró el 10 % neto
        $demand = (int) round(max(-2, min(2, $share * 20)));
    }
    return max(-BYR_DT_PRICE_STEP_MAX, min(BYR_DT_PRICE_STEP_MAX, $perf + $demand));
}

/**
 * Lee la respuesta de fixtures?id=X y devuelve las estadísticas de cada
 * jugador que estuvo en el partido: [player_id => [...]].
 * Goles en contra y penales errados salen de los eventos.
 */
function byr_dt_parse_fixture(array $fx): array
{
    $homeId = (int) ($fx['teams']['home']['id'] ?? 0);
    $gHome  = $fx['score']['fulltime']['home'] ?? $fx['goals']['home'] ?? null;
    $gAway  = $fx['score']['fulltime']['away'] ?? $fx['goals']['away'] ?? null;

    /* Goles recibidos por cada club en los 90 (para la valla invicta). */
    $conceded = [];
    if ($gHome !== null && $gAway !== null) {
        $awayId = (int) ($fx['teams']['away']['id'] ?? 0);
        $conceded[$homeId] = (int) $gAway;
        $conceded[$awayId] = (int) $gHome;
    }

    $ownGoals = [];
    $missed   = [];
    foreach (($fx['events'] ?? []) as $e) {
        $pid    = (int) ($e['player']['id'] ?? 0);
        $detail = (string) ($e['detail'] ?? '');
        if (!$pid) {
            continue;
        }
        if (($e['type'] ?? '') === 'Goal' && $detail === 'Own Goal') {
            $ownGoals[$pid] = ($ownGoals[$pid] ?? 0) + 1;
        }
        if ($detail === 'Missed Penalty') {
            $missed[$pid] = ($missed[$pid] ?? 0) + 1;
        }
    }

    $out = [];
    foreach (($fx['players'] ?? []) as $block) {
        $clubId = (int) ($block['team']['id'] ?? 0);
        foreach (($block['players'] ?? []) as $pl) {
            $pid = (int) ($pl['player']['id'] ?? 0);
            $st  = $pl['statistics'][0] ?? [];
            if (!$pid) {
                continue;
            }
            $min    = (int) ($st['games']['minutes'] ?? 0);
            $rating = $st['games']['rating'] ?? null;
            $rating = ($rating === null || (float) $rating <= 0) ? null : round((float) $rating, 2);

            $out[$pid] = [
                'club_id'     => $clubId,
                'minutes'     => $min,
                'goals'       => (int) ($st['goals']['total'] ?? 0),
                'assists'     => (int) ($st['goals']['assists'] ?? 0),
                'yellow'      => (int) ($st['cards']['yellow'] ?? 0),
                'red'         => (int) ($st['cards']['red'] ?? 0),
                'own_goals'   => $ownGoals[$pid] ?? 0,
                'pen_missed'  => max((int) ($st['penalty']['missed'] ?? 0), $missed[$pid] ?? 0),
                'pen_saved'   => (int) ($st['penalty']['saved'] ?? 0),
                'clean_sheet' => isset($conceded[$clubId]) && $conceded[$clubId] === 0 ? 1 : 0,
                'rating'      => $rating,
            ];
        }
    }
    return $out;
}

/**
 * Valida un plantel. $players: [player_id => ['position','club_id','price']]
 * (los 15 elegidos, con su precio de hoy). Devuelve el error o null.
 */
function byr_dt_validate_squad(array $players, array $starters, ?int $captain, string $formation): ?string
{
    if (count($players) !== array_sum(BYR_DT_SQUAD)) {
        return 'Tu plantel tiene que tener ' . array_sum(BYR_DT_SQUAD) . ' jugadores.';
    }
    $byPos  = ['ARQ' => 0, 'DEF' => 0, 'MED' => 0, 'DEL' => 0];
    $byClub = [];
    foreach ($players as $p) {
        $byPos[$p['position']]++;
        $byClub[$p['club_id']] = ($byClub[$p['club_id']] ?? 0) + 1;
    }
    $names = ['ARQ' => 'arqueros', 'DEF' => 'defensores', 'MED' => 'mediocampistas', 'DEL' => 'delanteros'];
    foreach (BYR_DT_SQUAD as $pos => $n) {
        if ($byPos[$pos] !== $n) {
            return "Necesitás $n {$names[$pos]} (tenés {$byPos[$pos]}).";
        }
    }
    foreach ($byClub as $n) {
        if ($n > BYR_DT_MAX_PER_CLUB) {
            return 'Máximo ' . BYR_DT_MAX_PER_CLUB . ' jugadores del mismo club.';
        }
    }

    $shape = BYR_DT_FORMATIONS[$formation] ?? null;
    if (!$shape) {
        return 'Esa formación no existe.';
    }
    $starters = array_values(array_unique(array_map('intval', $starters)));
    if (count($starters) !== 11) {
        return 'Elegí 11 titulares.';
    }
    $sPos = ['ARQ' => 0, 'DEF' => 0, 'MED' => 0, 'DEL' => 0];
    foreach ($starters as $id) {
        if (!isset($players[$id])) {
            return 'Hay un titular que no está en tu plantel.';
        }
        $sPos[$players[$id]['position']]++;
    }
    if ($sPos !== $shape) {
        return "Los titulares no coinciden con la formación $formation.";
    }
    if (!$captain || !in_array($captain, $starters, true)) {
        return 'Elegí un capitán entre los titulares.';
    }
    return null;
}

/**
 * Arma el once que puntúa y suma los puntos de un equipo en una fecha.
 *
 * $lineup: filas de dt_lineups [player_id, position, starter, captain].
 * $scores: [player_id => ['points','minutes']] de esa fecha.
 *
 * Cambio automático: un titular que no jugó (0 minutos o sin partido) lo
 * reemplaza un suplente del MISMO puesto que sí jugó. Si el capitán no
 * jugó, nadie hereda el ×2.
 *
 * Devuelve ['points','captain_points','used' => [player_id => pts]].
 */
function byr_dt_team_points(array $lineup, array $scores): array
{
    $starters = [];
    $bench    = [];
    $captain  = null;
    foreach ($lineup as $l) {
        $row = ['id' => (int) $l['player_id'], 'pos' => $l['position']];
        if ((int) $l['starter']) {
            $starters[] = $row;
            if ((int) $l['captain']) {
                $captain = (int) $l['player_id'];
            }
        } else {
            $bench[] = $row;
        }
    }
    $played = fn($id) => isset($scores[$id]) && (int) $scores[$id]['minutes'] > 0;

    $used = [];
    $usedBench = [];
    foreach ($starters as $s) {
        if ($played($s['id'])) {
            $used[$s['id']] = (int) $scores[$s['id']]['points'];
            continue;
        }
        foreach ($bench as $b) {
            if ($b['pos'] === $s['pos'] && !isset($usedBench[$b['id']]) && $played($b['id'])) {
                $usedBench[$b['id']] = true;
                $used[$b['id']] = (int) $scores[$b['id']]['points'];
                break;
            }
        }
    }

    $total = array_sum($used);
    $capPts = 0;
    if ($captain !== null && isset($used[$captain])) {
        $capPts = $used[$captain];
        $total += $capPts;                 // el capitán suma doble
        $used[$captain] *= 2;
    }
    return ['points' => $total, 'captain_points' => $capPts * 2, 'used' => $used];
}

/** "$9,5 M" a partir de décimas. */
function byr_dt_money(int $tenths): string
{
    $m = $tenths / 10;
    return '$' . (fmod($m, 1.0) == 0.0 ? number_format($m, 0, ',', '.') : number_format($m, 1, ',', '.')) . ' M';
}

/** Nombre corto de la fecha: "Clausura - 13" → "Fecha 13", "Clausura - Quarter-finals" → "Cuartos de final". */
function byr_dt_round_label(string $api): string
{
    $part = trim(preg_replace('/^.*?-\s*/', '', $api));
    if (ctype_digit($part)) {
        return 'Fecha ' . $part;
    }
    $map = [
        'Round of 32'    => '16avos de final',
        'Round of 16'    => 'Octavos de final',
        'Quarter-finals' => 'Cuartos de final',
        'Semi-finals'    => 'Semifinales',
        'Final'          => 'Final',
    ];
    return $map[$part] ?? $part;
}

/* =========================================================================
   Base de datos
   ========================================================================= */

/** ¿Está corrida la migración 2026-10-dt.sql? */
function byr_dt_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $pdo->query('SELECT 1 FROM dt_teams LIMIT 1');
            $ready = true;
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

function byr_dt_require_ready(PDO $pdo): void
{
    if (!byr_dt_ready($pdo)) {
        json_out(['error' => 'BYR DT todavía no está activado (falta correr 2026-10-dt.sql).', 'code' => 'dt-not-ready'], 503);
    }
}

function byr_dt_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** La fecha en juego: la última que no está cerrada (o la última cerrada). */
function byr_dt_current_round(PDO $pdo): ?array
{
    $r = $pdo->query("SELECT * FROM dt_rounds WHERE status <> 'closed' ORDER BY deadline ASC LIMIT 1")->fetch();
    return $r ?: null;
}

function byr_dt_last_closed_round(PDO $pdo): ?array
{
    $r = $pdo->query("SELECT * FROM dt_rounds WHERE status = 'closed' ORDER BY deadline DESC LIMIT 1")->fetch();
    return $r ?: null;
}

/**
 * Si la fecha abierta ya arrancó, congela los planteles de todos los equipos
 * (dt_lineups) y la pasa a 'live'. Se llama desde varios lados: el primero
 * que llega después del horario la cierra. Es idempotente.
 */
function byr_dt_ensure_lock(PDO $pdo): void
{
    $round = $pdo->query("SELECT * FROM dt_rounds WHERE status = 'open' ORDER BY deadline ASC LIMIT 1")->fetch();
    if (!$round || byr_dt_now() < $round['deadline']) {
        return;
    }
    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare("UPDATE dt_rounds SET status = 'live', locked_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'open'");
        $lock->execute([(int) $round['id']]);
        if ($lock->rowCount() === 0) {
            $pdo->rollBack();           // otro pedido la cerró recién
            return;
        }
        /* Solo equipos completos (15). Uno a medio armar no juega la fecha. */
        $pdo->prepare(
            'INSERT IGNORE INTO dt_lineups (round_id, team_id, player_id, position, starter, captain)
             SELECT ?, s.team_id, s.player_id, p.position, s.starter, s.captain
               FROM dt_squads s
               JOIN dt_players p ON p.id = s.player_id
              WHERE s.team_id IN (SELECT team_id FROM dt_squads GROUP BY team_id HAVING COUNT(*) = 15)'
        )->execute([(int) $round['id']]);
        $pdo->prepare(
            'INSERT IGNORE INTO dt_team_rounds (round_id, team_id, points, captain_points, saved_at)
             SELECT DISTINCT ?, l.team_id, 0, 0, t.saved_at
               FROM dt_lineups l JOIN dt_teams t ON t.id = l.team_id
              WHERE l.round_id = ?'
        )->execute([(int) $round['id'], (int) $round['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/** Recalcula los puntos de todos los equipos en una fecha. */
function byr_dt_recompute_round(PDO $pdo, int $roundId): void
{
    $sc = $pdo->prepare('SELECT player_id, points, minutes FROM dt_scores WHERE round_id = ?');
    $sc->execute([$roundId]);
    $scores = [];
    foreach ($sc->fetchAll() as $r) {
        $scores[(int) $r['player_id']] = $r;
    }

    $lu = $pdo->prepare('SELECT team_id, player_id, position, starter, captain FROM dt_lineups WHERE round_id = ? ORDER BY team_id');
    $lu->execute([$roundId]);
    $byTeam = [];
    foreach ($lu->fetchAll() as $r) {
        $byTeam[(int) $r['team_id']][] = $r;
    }

    $up = $pdo->prepare('UPDATE dt_team_rounds SET points = ?, captain_points = ? WHERE round_id = ? AND team_id = ?');
    foreach ($byTeam as $teamId => $lineup) {
        $res = byr_dt_team_points($lineup, $scores);
        $up->execute([$res['points'], $res['captain_points'], $roundId, $teamId]);
    }
}

/** Datos públicos de un club para dibujar la camiseta. */
function byr_dt_club_style(int $clubId, ?string $fallbackShort = null): array
{
    $s = BYR_DT_CLUB_STYLE[$clubId] ?? ['#ffffff', '#03124a', $fallbackShort ?: '???'];
    return ['color' => $s[0], 'trim' => $s[1], 'short' => $s[2]];
}

/** Iniciales para el escudo por defecto: "Los Cheddar FC" → "LC". */
function byr_dt_initials(string $name): string
{
    $words = array_values(array_filter(preg_split('/\s+/', trim($name)), fn($w) => mb_strlen($w) > 2));
    if (!$words) {
        $words = array_values(array_filter(preg_split('/\s+/', trim($name))));
    }
    $ini = '';
    foreach (array_slice($words, 0, 2) as $w) {
        $ini .= mb_strtoupper(mb_substr($w, 0, 1));
    }
    return $ini ?: 'DT';
}

/** Nombre del DT para mostrar: "Martín Rodríguez" → "Martín R." */
function byr_dt_dt_name(string $full): string
{
    $parts = preg_split('/\s+/', trim($full));
    if (!$parts || $parts[0] === '') {
        return 'Socio BYR';
    }
    $out = $parts[0];
    if (isset($parts[1]) && $parts[1] !== '') {
        $out .= ' ' . mb_strtoupper(mb_substr($parts[1], 0, 1)) . '.';
    }
    return $out;
}

/** Cuántos cambios hizo el equipo para la fecha abierta (vs. su último plantel congelado). */
function byr_dt_transfers_used(PDO $pdo, int $teamId, ?array $squadIds = null): array
{
    $last = $pdo->prepare('SELECT MAX(round_id) FROM dt_lineups WHERE team_id = ?');
    $last->execute([$teamId]);
    $lastRound = (int) $last->fetchColumn();
    if (!$lastRound) {
        return ['limited' => false, 'used' => 0, 'left' => null];   // nunca jugó: cambios libres
    }
    $prev = $pdo->prepare('SELECT player_id FROM dt_lineups WHERE round_id = ? AND team_id = ?');
    $prev->execute([$lastRound, $teamId]);
    $prevIds = array_map('intval', $prev->fetchAll(PDO::FETCH_COLUMN));

    if ($squadIds === null) {
        $cur = $pdo->prepare('SELECT player_id FROM dt_squads WHERE team_id = ?');
        $cur->execute([$teamId]);
        $squadIds = array_map('intval', $cur->fetchAll(PDO::FETCH_COLUMN));
    }
    $used = count(array_diff($squadIds, $prevIds));
    return ['limited' => true, 'used' => $used, 'left' => max(0, BYR_DT_TRANSFERS - $used), 'prev' => $prevIds];
}

/** Ruta pública del escudo, o null. */
function byr_dt_crest_url(?string $crest): ?string
{
    return $crest ? '/' . ltrim($crest, '/') : null;
}

/* =========================================================================
   Armado de respuestas (comunes a varios endpoints)
   ========================================================================= */

/** El equipo de un socio, o null. */
function byr_dt_team_of(PDO $pdo, int $userId): ?array
{
    $st = $pdo->prepare('SELECT t.*, u.name AS user_name FROM dt_teams t JOIN users u ON u.id = t.user_id WHERE t.user_id = ?');
    $st->execute([$userId]);
    $t = $st->fetch();
    return $t ?: null;
}

/** Equipo listo para el frontend. */
function byr_dt_team_public(array $t): array
{
    return [
        'id'        => (int) $t['id'],
        'name'      => $t['name'],
        'initials'  => byr_dt_initials($t['name']),
        'crest'     => byr_dt_crest_url($t['crest'] ?? null),
        'dt'        => byr_dt_dt_name((string) ($t['user_name'] ?? '')),
        'formation' => $t['formation'],
        'bank'      => (int) $t['bank'],
        'savedAt'   => $t['saved_at'],
        'nameReset' => (bool) ($t['name_reset'] ?? 0),
    ];
}

/** Un jugador listo para el frontend (con su club). */
function byr_dt_player_public(array $p): array
{
    $club = byr_dt_club_style((int) $p['club_id'], $p['club_short'] ?? null);
    return [
        'id'       => (int) $p['id'],
        'name'     => $p['name'],
        'pos'      => $p['position'],
        'clubId'   => (int) $p['club_id'],
        'club'     => $club['short'],
        'clubName' => $p['club_name'] ?? '',
        'color'    => $club['color'],
        'trim'     => $club['trim'],
        'price'    => (int) $p['price'],
        'photo'    => $p['photo'] ?? null,
        'active'   => (bool) ($p['active'] ?? 1),
    ];
}

/** El plantel actual de un equipo. */
function byr_dt_squad(PDO $pdo, int $teamId): array
{
    $st = $pdo->prepare(
        'SELECT p.*, c.name AS club_name, c.short AS club_short, s.starter, s.captain
           FROM dt_squads s
           JOIN dt_players p ON p.id = s.player_id
           LEFT JOIN dt_clubs c ON c.id = p.club_id
          WHERE s.team_id = ?
          ORDER BY FIELD(p.position, "ARQ","DEF","MED","DEL"), s.starter DESC, p.price DESC'
    );
    $st->execute([$teamId]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $row = byr_dt_player_public($r);
        $row['starter'] = (bool) $r['starter'];
        $row['captain'] = (bool) $r['captain'];
        $out[] = $row;
    }
    return $out;
}

/**
 * Ranking. $scope 'fecha' (necesita $roundId) o 'general'.
 * Devuelve ['rows' => top N, 'me' => fila del equipo o null, 'total' => equipos].
 * Orden: puntos, puntos del capitán, quien confirmó antes.
 */
function byr_dt_ranking(PDO $pdo, string $scope, ?int $roundId, ?int $myTeamId, int $limit = 50, bool $open = false): array
{
    if ($scope === 'fecha' && $open) {
        /* Fecha que todavía no arrancó: todos los equipos confirmados, con 0
           puntos. El orden es el del desempate (quien confirmó antes). */
        $st = $pdo->query(
            'SELECT t.id AS team_id, 0 AS points, 0 AS captain_points, t.name, t.crest, u.name AS user_name
               FROM dt_teams t
               JOIN users u ON u.id = t.user_id
              WHERE t.saved_at IS NOT NULL
              ORDER BY t.saved_at ASC, t.id ASC'
        );
    } elseif ($scope === 'fecha') {
        $st = $pdo->prepare(
            'SELECT tr.team_id, tr.points, tr.captain_points, t.name, t.crest, u.name AS user_name
               FROM dt_team_rounds tr
               JOIN dt_teams t ON t.id = tr.team_id
               JOIN users u ON u.id = t.user_id
              WHERE tr.round_id = ?
              ORDER BY tr.points DESC, tr.captain_points DESC, tr.saved_at IS NULL, tr.saved_at ASC, tr.team_id ASC'
        );
        $st->execute([(int) $roundId]);
    } else {
        /* General: los que ya jugaron alguna fecha y también los que
           confirmaron su equipo y todavía no sumaron (aparecen con 0). */
        $st = $pdo->query(
            'SELECT t.id AS team_id, COALESCE(SUM(tr.points), 0) AS points,
                    COALESCE(SUM(tr.captain_points), 0) AS captain_points,
                    t.name, t.crest, u.name AS user_name, t.created_at
               FROM dt_teams t
               JOIN users u ON u.id = t.user_id
               LEFT JOIN dt_team_rounds tr ON tr.team_id = t.id
              WHERE t.saved_at IS NOT NULL OR tr.team_id IS NOT NULL
              GROUP BY t.id, t.name, t.crest, u.name, t.created_at
              ORDER BY points DESC, captain_points DESC, t.created_at ASC, t.id ASC'
        );
    }
    $all  = $st->fetchAll();
    $rows = [];
    $me   = null;
    foreach ($all as $i => $r) {
        $row = [
            'pos'      => $i + 1,
            'teamId'   => (int) $r['team_id'],
            'team'     => $r['name'],
            'initials' => byr_dt_initials($r['name']),
            'crest'    => byr_dt_crest_url($r['crest']),
            'dt'       => byr_dt_dt_name((string) $r['user_name']),
            'points'   => (int) $r['points'],
            'me'       => $myTeamId !== null && (int) $r['team_id'] === $myTeamId,
        ];
        if ($i < $limit) {
            $rows[] = $row;
        }
        if ($row['me']) {
            $me = $row;
        }
    }
    return ['rows' => $rows, 'me' => $me, 'total' => count($all)];
}

/** "Jue 15/10 20:00" en hora de Argentina. */
function byr_dt_when(string $utc): string
{
    static $dias = ['Sun' => 'Dom', 'Mon' => 'Lun', 'Tue' => 'Mar', 'Wed' => 'Mié', 'Thu' => 'Jue', 'Fri' => 'Vie', 'Sat' => 'Sáb'];
    try {
        $dt = new DateTime($utc, new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone(BYR_PRODE_TZ));
    } catch (Exception $e) {
        return '';
    }
    return ($dias[$dt->format('D')] ?? '') . ' ' . $dt->format('d/m H:i');
}

/** La fecha lista para el frontend. */
function byr_dt_round_public(?array $r): ?array
{
    if (!$r) {
        return null;
    }
    return [
        'id'           => (int) $r['id'],
        'name'         => $r['name'],
        'status'       => $r['status'],
        'deadline'     => gmdate('c', strtotime($r['deadline'] . ' UTC')),
        'deadlineText' => byr_dt_when($r['deadline']),
        'secondsLeft'  => max(0, strtotime($r['deadline'] . ' UTC') - time()),
    ];
}

/** Como byr_apifootball_get pero devuelve la respuesta entera (con "paging"). */
function byr_apifootball_get_full(string $path, array $params = []): array
{
    $key = byr_apifootball_key();
    if ($key === '') {
        throw new RuntimeException('Falta la API key de fútbol (apifootball_key en config.php).');
    }
    $url = 'https://v3.football.api-sports.io/' . ltrim($path, '/') . ($params ? '?' . http_build_query($params) : '');
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . $key],
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($body === false) {
        throw new RuntimeException('No se pudo conectar con la API de fútbol: ' . $err);
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('Respuesta inválida de la API de fútbol.');
    }
    if (!empty($data['errors'])) {
        $detail = is_array($data['errors']) ? implode(' ', array_map('strval', $data['errors'])) : 'error';
        throw new RuntimeException('La API de fútbol devolvió un error: ' . $detail);
    }
    return $data;
}
