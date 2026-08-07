<?php
/**
 * Ganador de la ÚLTIMA fecha cerrada del Prode — visible para todos los socios.
 *
 * Muestra quién ganó la fecha (el mejor pronosticador de esa jornada), aparte
 * del ranking acumulado. Toma la fecha 'closed' más reciente y calcula su
 * mejor pronosticador con la misma lógica que usa el premio (puntos, luego
 * exactos, luego el más antiguo). Devuelve solo datos públicos (nombre de
 * pila + avatar), nunca el código de cupón.
 *
 * Respuesta: { winner: {roundName, name, avatar, points, exacts} } o
 *            { winner: null } si todavía no hay ninguna fecha cerrada con
 *            ganador.
 */
require_once __DIR__ . '/lib.php';

require_auth();
$pdo = db();

/* Última fecha cerrada que tenga partidos. */
$round = $pdo->query(
    "SELECT r.* FROM prode_rounds r
      WHERE r.status = 'closed'
        AND EXISTS (SELECT 1 FROM prode_matches m WHERE m.round_id = r.id)
      ORDER BY r.id DESC
      LIMIT 1"
)->fetch();

if (!$round) {
    json_out(['winner' => null]);
}

/* Mejor pronosticador de esa fecha (mismo criterio que el premio). */
$top = $pdo->prepare(
    'SELECT u.name, u.avatar,
            COALESCE(SUM(p.points), 0) AS pts,
            SUM(CASE WHEN p.points = 10 THEN 1 ELSE 0 END) AS exacts
       FROM prode_predictions p
       JOIN prode_matches m ON m.id = p.match_id
       JOIN users u ON u.id = p.user_id
      WHERE m.round_id = ? AND p.points IS NOT NULL
      GROUP BY p.user_id, u.name, u.avatar
      ORDER BY pts DESC, exacts DESC, p.user_id ASC
      LIMIT 1'
);
$top->execute([(int) $round['id']]);
$best = $top->fetch();

/* Sin pronósticos con puntos > 0: no hubo ganador (nadie acertó nada). */
if (!$best || (int) $best['pts'] <= 0) {
    json_out(['winner' => null]);
}

/* Solo el primer nombre, para no exponer el nombre completo. */
$fullName  = trim((string) $best['name']);
$firstName = $fullName !== '' ? preg_split('/\s+/', $fullName)[0] : 'Socio BYR';

json_out([
    'winner' => [
        'roundName' => $round['name'],
        'name'      => $firstName,
        'avatar'    => $best['avatar'] ?: '🍔',
        'points'    => (int) $best['pts'],
        'exacts'    => (int) $best['exacts'],
    ],
]);
