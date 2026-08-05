<?php
/**
 * Prode — utilidades compartidas.
 *   - Lectura de la config (API key de API-Football, liga, temporada).
 *   - Cliente HTTP a API-Football (api-sports.io).
 *   - Cálculo de puntaje de un pronóstico.
 *   - Armado de la "tarjeta" de partido para el frontend (con bloqueo y
 *     etiqueta de horario en hora de Argentina).
 */

require_once __DIR__ . '/../helpers.php';

const BYR_PRODE_TZ = 'America/Argentina/Buenos_Aires';

/** Lee y cachea el config.php del server (mismo archivo que usa la base). */
function byr_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $path = __DIR__ . '/../config.php';
        $cfg  = file_exists($path) ? (require $path) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

function byr_apifootball_key(): string
{
    return (string) (byr_config()['apifootball_key'] ?? '');
}

function byr_prode_league(): int
{
    return (int) (byr_config()['prode_league'] ?? 128);
}

function byr_prode_season(): int
{
    return (int) (byr_config()['prode_season'] ?? (int) date('Y'));
}

/**
 * Llama a la API de API-Football y devuelve el array `response`.
 * Lanza RuntimeException si no hay key o si la API falla.
 */
function byr_apifootball_get(string $path, array $params = []): array
{
    $key = byr_apifootball_key();
    if ($key === '') {
        throw new RuntimeException('Falta la API key de fútbol (apifootball_key en config.php).');
    }

    $url = 'https://v3.football.api-sports.io/' . ltrim($path, '/');
    if ($params) {
        $url .= '?' . http_build_query($params);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . $key],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        throw new RuntimeException('No se pudo conectar con la API de fútbol: ' . $err);
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('Respuesta inválida de la API de fútbol.');
    }
    if ($code >= 400 || !empty($data['errors'])) {
        $detail = is_array($data['errors'] ?? null) ? implode(' ', $data['errors']) : 'error';
        throw new RuntimeException('La API de fútbol devolvió un error: ' . $detail);
    }

    return $data['response'] ?? [];
}

/**
 * Puntaje de un pronóstico contra el resultado real.
 *   - Resultado exacto → 10
 *   - Acertó ganador/empate (no el resultado exacto) → 5
 *   - No acertó → 0
 */
function byr_prode_score(int $predH, int $predA, int $realH, int $realA): int
{
    if ($predH === $realH && $predA === $realA) {
        return 10;
    }
    $predSign = $predH <=> $predA; // -1 gana visitante, 0 empate, 1 gana local
    $realSign = $realH <=> $realA;
    return ($predSign === $realSign) ? 5 : 0;
}

/** "Vie 21:30" en hora de Argentina a partir de un DATETIME UTC. */
function byr_prode_kickoff_label(string $kickoffUtc): string
{
    static $dias = ['Sun' => 'Dom', 'Mon' => 'Lun', 'Tue' => 'Mar', 'Wed' => 'Mié', 'Thu' => 'Jue', 'Fri' => 'Vie', 'Sat' => 'Sáb'];
    try {
        $dt = new DateTime($kickoffUtc, new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone(BYR_PRODE_TZ));
    } catch (Exception $e) {
        return '';
    }
    return ($dias[$dt->format('D')] ?? $dt->format('D')) . ' ' . $dt->format('H:i');
}

/** ¿El partido ya arrancó? (bloquea la carga/edición del pronóstico) */
function byr_prode_is_locked(string $kickoffUtc): bool
{
    return gmdate('Y-m-d H:i:s') >= $kickoffUtc;
}

/**
 * Puntúa todos los pronósticos de un partido ya jugado (con su resultado).
 * Devuelve cuántos pronósticos se puntuaron.
 */
function byr_prode_score_match(PDO $pdo, int $matchId, int $realH, int $realA): int
{
    $preds = $pdo->prepare('SELECT id, home_pred, away_pred FROM prode_predictions WHERE match_id = ?');
    $preds->execute([$matchId]);
    $upd = $pdo->prepare('UPDATE prode_predictions SET points = ? WHERE id = ?');
    $n = 0;
    foreach ($preds->fetchAll() as $p) {
        $pts = byr_prode_score((int) $p['home_pred'], (int) $p['away_pred'], $realH, $realA);
        $upd->execute([$pts, (int) $p['id']]);
        $n++;
    }
    return $n;
}

/**
 * Si YA se jugaron todos los partidos de la fecha, la cierra y le da un cupón
 * al mejor pronosticador (premio al ganador). Idempotente: no premia dos veces.
 * Devuelve ['closed' => bool, 'winner' => array|null].
 */
function byr_prode_close_round_if_complete(PDO $pdo, int $roundId): array
{
    $round = $pdo->prepare('SELECT * FROM prode_rounds WHERE id = ?');
    $round->execute([$roundId]);
    $round = $round->fetch();
    if (!$round) {
        return ['closed' => false, 'winner' => null];
    }

    $counts = $pdo->prepare(
        "SELECT COUNT(*) AS total, SUM(status = 'finished') AS finished FROM prode_matches WHERE round_id = ?"
    );
    $counts->execute([$roundId]);
    $c = $counts->fetch();
    $total    = (int) $c['total'];
    $finished = (int) $c['finished'];

    if ($total === 0 || $finished < $total) {
        return ['closed' => false, 'winner' => null];
    }
    if ($round['prize_awarded']) {
        return ['closed' => true, 'winner' => null]; // ya estaba premiada
    }

    $top = $pdo->prepare(
        'SELECT p.user_id, u.name, COALESCE(SUM(p.points),0) AS pts,
                SUM(CASE WHEN p.points = 10 THEN 1 ELSE 0 END) AS exacts
           FROM prode_predictions p
           JOIN prode_matches m ON m.id = p.match_id
           JOIN users u ON u.id = p.user_id
          WHERE m.round_id = ? AND p.points IS NOT NULL
          GROUP BY p.user_id, u.name
          ORDER BY pts DESC, exacts DESC, p.user_id ASC
          LIMIT 1'
    );
    $top->execute([$roundId]);
    $best = $top->fetch();

    $winner = null;
    if ($best && (int) $best['pts'] > 0) {
        $code  = byr_generate_redemption_code($pdo);
        $label = 'Ganador ' . $round['name'] . ' — Prode BYR';
        $pdo->prepare(
            'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status)
             VALUES (?, ?, "prode-winner", ?, "Prode BYR", "pending")'
        )->execute([(int) $best['user_id'], $code, $label]);
        $winner = [
            'userId' => (int) $best['user_id'],
            'name'   => $best['name'],
            'points' => (int) $best['pts'],
            'code'   => $code,
        ];
    }

    $pdo->prepare('UPDATE prode_rounds SET status = "closed", prize_awarded = 1 WHERE id = ?')->execute([$roundId]);
    return ['closed' => true, 'winner' => $winner];
}
