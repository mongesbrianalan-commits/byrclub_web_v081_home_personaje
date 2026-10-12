<?php
/**
 * BYR DT — el mercado: todos los jugadores activos con precio, club, puesto,
 * promedio de puntos en el juego y cuántos equipos lo tienen.
 * Se manda la lista entera (unos 800 jugadores, ~80 KB) y el filtro se hace
 * en el navegador, que es instantáneo.
 */
require_once __DIR__ . '/lib.php';

require_auth();
$pdo = db();
byr_dt_require_ready($pdo);

$rows = $pdo->query(
    'SELECT p.id, p.name, p.position, p.club_id, p.price, p.photo, p.active, p.season_rating,
            c.name AS club_name, c.short AS club_short
       FROM dt_players p
       LEFT JOIN dt_clubs c ON c.id = p.club_id
      WHERE p.active = 1 AND p.price > 0
      ORDER BY p.price DESC, p.name ASC'
)->fetchAll();

/* Promedio de puntos en las fechas que jugó (minutos > 0). */
$avg = [];
foreach ($pdo->query('SELECT player_id, AVG(points) AS a, SUM(points) AS t FROM dt_scores WHERE minutes > 0 GROUP BY player_id') as $r) {
    $avg[(int) $r['player_id']] = [round((float) $r['a'], 1), (int) $r['t']];
}

/* Popularidad: % de equipos completos que lo tienen. */
$teams = (int) $pdo->query('SELECT COUNT(*) FROM (SELECT team_id FROM dt_squads GROUP BY team_id HAVING COUNT(*) = 15) x')->fetchColumn();
$own = [];
foreach ($pdo->query('SELECT player_id, COUNT(*) AS n FROM dt_squads GROUP BY player_id') as $r) {
    $own[(int) $r['player_id']] = (int) $r['n'];
}

$out = [];
foreach ($rows as $r) {
    $p = byr_dt_player_public($r);
    $id = $p['id'];
    $p['avg']     = $avg[$id][0] ?? null;
    $p['total']   = $avg[$id][1] ?? 0;
    $p['rating']  = $r['season_rating'] !== null ? (float) $r['season_rating'] : null;
    $p['owners']  = $teams > 0 ? (int) round(100 * ($own[$id] ?? 0) / $teams) : 0;
    unset($p['active']);
    $out[] = $p;
}

json_out(['ok' => true, 'players' => $out]);
