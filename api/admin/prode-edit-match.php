<?php
/**
 * ADMIN — Corrige un partido ya cargado: los nombres de los equipos (y vuelve
 * a buscar el escudo de cada uno, por si el nombre se cargó distinto al de la
 * API) y, si vienen `date` + `time`, también el horario.
 *
 * El horario se ingresa en hora de Argentina y se guarda en UTC, igual que en
 * prode-add-match.php.
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

$in      = body_json();
$matchId = (int) ($in['matchId'] ?? 0);
$home    = trim($in['home'] ?? '');
$away    = trim($in['away'] ?? '');
$date    = trim($in['date'] ?? '');
$time    = trim($in['time'] ?? '');

if ($matchId <= 0 || $home === '' || $away === '') {
    json_out(['error' => 'Completá el local y el visitante.'], 422);
}

$stmt = $pdo->prepare('SELECT kickoff FROM prode_matches WHERE id = ?');
$stmt->execute([$matchId]);
$current = $stmt->fetch();
if (!$current) {
    json_out(['error' => 'Ese partido no existe.'], 404);
}

/* El horario es opcional: si no mandan día y hora, queda el que ya tenía. */
$kickoffUtc = $current['kickoff'];
if ($date !== '' || $time !== '') {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) {
        json_out(['error' => 'Para cambiar el horario cargá día y hora.'], 422);
    }
    try {
        $dt = new DateTime($date . ' ' . $time . ':00', new DateTimeZone(BYR_PRODE_TZ));
        $dt->setTimezone(new DateTimeZone('UTC'));
    } catch (Exception $e) {
        json_out(['error' => 'Fecha u horario inválido.'], 422);
    }
    $kickoffUtc = $dt->format('Y-m-d H:i:s');
}

$homeLogo = byr_prode_find_logo($pdo, $home);
$awayLogo = byr_prode_find_logo($pdo, $away);

$pdo->prepare(
    'UPDATE prode_matches SET home_team = ?, away_team = ?, home_logo = ?, away_logo = ?, kickoff = ?
      WHERE id = ?'
)->execute([$home, $away, $homeLogo, $awayLogo, $kickoffUtc, $matchId]);

json_out([
    'ok'           => true,
    'homeLogo'     => (bool) $homeLogo,
    'awayLogo'     => (bool) $awayLogo,
    'kickoffLabel' => byr_prode_kickoff_label($kickoffUtc),
]);
