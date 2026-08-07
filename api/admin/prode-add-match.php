<?php
/**
 * ADMIN — Carga un partido A MANO (sin API). Sirve cuando el plan de la API
 * no tiene la temporada actual. Crea/reusa la fecha y agrega el partido; el
 * horario se ingresa en hora de Argentina y se guarda en UTC.
 */
require_once __DIR__ . '/../prode/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

$in    = body_json();
$name  = trim($in['roundName'] ?? '');
$home  = trim($in['home'] ?? '');
$away  = trim($in['away'] ?? '');
$date  = trim($in['date'] ?? '');
$time  = trim($in['time'] ?? '');

if ($name === '' || $home === '' || $away === '') {
    json_out(['error' => 'Completá la fecha, el equipo local y el visitante.'], 422);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) {
    json_out(['error' => 'Elegí día y horario del partido.'], 422);
}

/* Horario ingresado en hora de Argentina → guardamos en UTC. */
try {
    $dt = new DateTime($date . ' ' . $time . ':00', new DateTimeZone(BYR_PRODE_TZ));
    $dt->setTimezone(new DateTimeZone('UTC'));
} catch (Exception $e) {
    json_out(['error' => 'Fecha u horario inválido.'], 422);
}
$kickoffUtc = $dt->format('Y-m-d H:i:s');

/* Chequeo temprano: si faltan las tablas del Prode, avisamos claro (en vez de
   un 500 sin detalle). Se soluciona corriendo la migración 2026-08-prode.sql. */
try {
    $pdo->query('SELECT 1 FROM prode_rounds LIMIT 1');
    $pdo->query('SELECT 1 FROM prode_matches LIMIT 1');
} catch (PDOException $e) {
    json_out([
        'error' => 'Faltan las tablas del Prode. Corré la migración 2026-08-prode.sql en phpMyAdmin y volvé a probar.',
        'code'  => 'no-tables',
    ], 500);
}

$season = byr_prode_season();

try {
    /* Fecha (round): reusar la del mismo nombre+temporada, o crearla. */
    $stmt = $pdo->prepare('SELECT id FROM prode_rounds WHERE name = ? AND season = ? LIMIT 1');
    $stmt->execute([$name, $season]);
    $roundId = $stmt->fetchColumn();
    if (!$roundId) {
        $pdo->prepare('INSERT INTO prode_rounds (name, competition, season) VALUES (?, ?, ?)')
            ->execute([$name, 'Primera División Argentina', $season]);
        $roundId = (int) $pdo->lastInsertId();
    }

    /* Escudos: los buscamos por nombre (si ya sincronizaste los equipos). El
       equipo puede no tener escudo (ej. recién ascendido y no está en la
       temporada de escudos): en ese caso se guarda NULL y el partido igual carga. */
    $homeLogo = byr_prode_find_logo($pdo, $home);
    $awayLogo = byr_prode_find_logo($pdo, $away);

    $pdo->prepare(
        'INSERT INTO prode_matches (round_id, home_team, away_team, home_logo, away_logo, kickoff, status)
         VALUES (?, ?, ?, ?, ?, ?, "scheduled")'
    )->execute([$roundId, $home, $away, $homeLogo, $awayLogo, $kickoffUtc]);
    $matchId = (int) $pdo->lastInsertId();
} catch (Throwable $e) {
    error_log('prode-add-match: ' . $e->getMessage());
    json_out(['error' => 'No se pudo guardar el partido. Probá de nuevo.'], 500);
}

json_out([
    'ok'           => true,
    'roundId'      => (int) $roundId,
    'matchId'      => $matchId,
    'home'         => $home,
    'away'         => $away,
    'kickoffLabel' => byr_prode_kickoff_label($kickoffUtc),
]);
