<?php
/**
 * ADMIN — Corrige los nombres de los equipos de un partido y vuelve a buscar
 * el escudo de cada uno. Sirve cuando un nombre se cargó distinto al de la API
 * y quedó sin escudo.
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

if ($matchId <= 0 || $home === '' || $away === '') {
    json_out(['error' => 'Completá el local y el visitante.'], 422);
}

$stmt = $pdo->prepare('SELECT id FROM prode_matches WHERE id = ?');
$stmt->execute([$matchId]);
if (!$stmt->fetch()) {
    json_out(['error' => 'Ese partido no existe.'], 404);
}

$homeLogo = byr_prode_find_logo($pdo, $home);
$awayLogo = byr_prode_find_logo($pdo, $away);

$pdo->prepare('UPDATE prode_matches SET home_team = ?, away_team = ?, home_logo = ?, away_logo = ? WHERE id = ?')
    ->execute([$home, $away, $homeLogo, $awayLogo, $matchId]);

json_out([
    'ok'         => true,
    'homeLogo'   => (bool) $homeLogo,
    'awayLogo'   => (bool) $awayLogo,
]);
