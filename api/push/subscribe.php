<?php
/**
 * Guarda la suscripción a avisos del dispositivo del socio logueado.
 * Body: la suscripción del navegador tal cual (PushSubscription.toJSON()):
 *   { endpoint, keys: { p256dh, auth } }
 * Si ese dispositivo ya estaba (aunque de otro socio), se reasigna a este.
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

if (!byr_push_ready($pdo)) {
    json_out(['error' => 'Los avisos todavía no están activos.', 'code' => 'not-ready'], 409);
}

$in       = body_json();
$endpoint = trim((string) ($in['endpoint'] ?? ''));
$p256dh   = trim((string) ($in['keys']['p256dh'] ?? ''));
$auth     = trim((string) ($in['keys']['auth'] ?? ''));

if (!preg_match('#^https://[^\s]+$#', $endpoint) || strlen($endpoint) > 600) {
    json_out(['error' => 'Suscripción inválida.'], 422);
}
if (strlen(byr_b64url_decode($p256dh)) !== 65 || strlen(byr_b64url_decode($auth)) < 16) {
    json_out(['error' => 'Suscripción inválida.'], 422);
}

$ua = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 190);

$pdo->prepare(
    'INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint),
                             p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)'
)->execute([$id, $endpoint, hash('sha256', $endpoint), $p256dh, $auth, $ua]);

/* Aviso de bienvenida: confirma en el momento que todo anda. */
$test = !empty($in['welcome'])
    ? byr_push_to_user($pdo, $id, [
        'title' => '🔔 ¡Avisos activados!',
        'body'  => 'Te vamos a avisar cuando tu pedido esté listo, las fechas del Prode y novedades del club.',
        'url'   => '/perfil.html',
        'tag'   => 'welcome',
    ])
    : null;

json_out(['ok' => true, 'welcome' => $test]);
