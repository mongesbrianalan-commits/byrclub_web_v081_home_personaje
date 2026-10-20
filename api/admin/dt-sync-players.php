<?php
/**
 * ADMIN — BYR DT: trae clubes, planteles y estadísticas desde API-Football
 * y calcula los precios. Va por pasos cortos (el panel los encadena solo),
 * porque son ~90 consultas y el hosting corta los pedidos largos.
 *
 * Body JSON:
 *   { step: "clubs" }                       → los 30 clubes (1 consulta)
 *   { step: "squads", offset: 0 }           → planteles, de a 6 clubes
 *   { step: "stats", page: 1 }              → estadísticas de la temporada, de a 4 páginas
 *   { step: "prices" }                      → precio inicial a quien no tenga
 *
 * Cada paso devuelve { done, next } para que el panel siga.
 */
require_once __DIR__ . '/../dt/lib.php';
require_method('POST');

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);
@set_time_limit(60);

$in     = body_json();
$step   = (string) ($in['step'] ?? '');
$league = byr_prode_league();
$season = byr_prode_season();

try {
    if ($step === 'clubs') {
        $teams = byr_apifootball_get('teams', ['league' => $league, 'season' => $season]);
        $up = $pdo->prepare(
            'INSERT INTO dt_clubs (id, name, short, logo, color, trim_color) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), short = VALUES(short), logo = VALUES(logo),
                                     color = VALUES(color), trim_color = VALUES(trim_color)'
        );
        foreach ($teams as $t) {
            $id    = (int) $t['team']['id'];
            $style = byr_dt_club_style($id, $t['team']['code'] ?? strtoupper(substr($t['team']['name'], 0, 3)));
            $up->execute([$id, $t['team']['name'], $style['short'], $t['team']['logo'] ?? null, $style['color'], $style['trim']]);
        }
        /* Arranca la sincronización de planteles: todos quedan "inactivos"
           hasta que aparezcan en algún plantel. */
        $pdo->exec('UPDATE dt_players SET active = 0');
        json_out(['ok' => true, 'done' => count($teams) . ' clubes', 'next' => ['step' => 'squads', 'offset' => 0]]);
    }

    if ($step === 'squads') {
        $offset = max(0, (int) ($in['offset'] ?? 0));
        $clubs  = $pdo->query('SELECT id FROM dt_clubs ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        $slice  = array_slice($clubs, $offset, 6);

        $up = $pdo->prepare(
            'INSERT INTO dt_players (id, name, club_id, position, number, photo, active) VALUES (?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE name = VALUES(name), club_id = VALUES(club_id),
                                     number = VALUES(number), photo = VALUES(photo), active = 1'
            /* El puesto NO se pisa: un jugador que ya está cargado conserva su
               puesto todo el torneo. Si la API lo cambia (pasa seguido entre
               DEF/MED/DEL), los equipos que lo tienen quedarían con puestos
               descompensados y huecos en la cancha. */
        );
        $n = 0;
        foreach ($slice as $clubId) {
            $res = byr_apifootball_get('players/squads', ['team' => (int) $clubId]);
            foreach (($res[0]['players'] ?? []) as $p) {
                $pos = byr_dt_pos((string) ($p['position'] ?? ''));
                if (!$pos || empty($p['id'])) {
                    continue;
                }
                $up->execute([(int) $p['id'], mb_substr((string) $p['name'], 0, 80), (int) $clubId, $pos, $p['number'] ?? null, $p['photo'] ?? null]);
                $n++;
            }
        }
        $nextOffset = $offset + 6;
        $next = $nextOffset < count($clubs) ? ['step' => 'squads', 'offset' => $nextOffset] : ['step' => 'stats', 'page' => 1];
        json_out(['ok' => true, 'done' => "Planteles: clubes " . ($offset + 1) . '–' . min($nextOffset, count($clubs)) . " ($n jugadores)", 'next' => $next]);
    }

    if ($step === 'stats') {
        $page  = max(1, (int) ($in['page'] ?? 1));
        $total = $page;
        $up = $pdo->prepare(
            'UPDATE dt_players SET full_name = ?, season_rating = ?, season_minutes = ?, season_goals = ?, season_assists = ?
              WHERE id = ?'
        );
        for ($i = 0; $i < 4 && $page <= $total; $i++, $page++) {
            $res = byr_apifootball_get_full('players', ['league' => $league, 'season' => $season, 'page' => $page]);
            $total = (int) ($res['paging']['total'] ?? $page);
            foreach (($res['response'] ?? []) as $row) {
                /* Puede venir más de una línea si jugó en dos clubes: se suman. */
                $min = 0; $g = 0; $a = 0; $rSum = 0.0; $rMin = 0;
                foreach (($row['statistics'] ?? []) as $s) {
                    if ((int) ($s['league']['id'] ?? 0) !== $league) {
                        continue;
                    }
                    $m = (int) ($s['games']['minutes'] ?? 0);
                    $min += $m;
                    $g   += (int) ($s['goals']['total'] ?? 0);
                    $a   += (int) ($s['goals']['assists'] ?? 0);
                    if (!empty($s['games']['rating']) && $m > 0) {
                        $rSum += (float) $s['games']['rating'] * $m;
                        $rMin += $m;
                    }
                }
                $full = trim(($row['player']['firstname'] ?? '') . ' ' . ($row['player']['lastname'] ?? ''));
                $up->execute([$full !== '' ? mb_substr($full, 0, 140) : null, $rMin ? round($rSum / $rMin, 2) : null, $min, $g, $a, (int) $row['player']['id']]);
            }
        }
        $next = $page <= $total ? ['step' => 'stats', 'page' => $page] : ['step' => 'prices'];
        json_out(['ok' => true, 'done' => 'Estadísticas: página ' . ($page - 1) . " de $total", 'next' => $next]);
    }

    if ($step === 'prices') {
        /* Antes de la primera fecha se recalcula a todos; después, solo a
           los que no tienen precio (refuerzos nuevos). El precio fijado a
           mano por el admin no se toca. */
        $started = (bool) $pdo->query("SELECT 1 FROM dt_rounds WHERE status <> 'open' LIMIT 1")->fetchColumn();
        $where   = $started ? 'price = 0' : 'price_locked = 0';
        $rows = $pdo->query("SELECT id, position, season_rating, season_minutes, season_goals, season_assists FROM dt_players WHERE active = 1 AND $where")->fetchAll();
        $up = $pdo->prepare('UPDATE dt_players SET price = ? WHERE id = ?');
        foreach ($rows as $r) {
            $up->execute([
                byr_dt_initial_price($r['position'], $r['season_rating'] !== null ? (float) $r['season_rating'] : null,
                    (int) $r['season_minutes'], (int) $r['season_goals'], (int) $r['season_assists']),
                (int) $r['id'],
            ]);
        }
        $count = (int) $pdo->query('SELECT COUNT(*) FROM dt_players WHERE active = 1')->fetchColumn();
        json_out(['ok' => true, 'done' => 'Precios: ' . count($rows) . " actualizados · $count jugadores activos", 'next' => null]);
    }

    json_out(['error' => 'Paso desconocido.'], 422);
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 502);
}
