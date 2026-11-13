<?php
/**
 * Da de baja los avisos de ESTE dispositivo.
 * Body: { endpoint }
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

if (!byr_push_ready($pdo)) {
    json_out(['ok' => true]);
}

$endpoint = trim((string) (body_json()['endpoint'] ?? ''));
if ($endpoint !== '') {
    $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?')
        ->execute([hash('sha256', $endpoint), $id]);
}
json_out(['ok' => true]);
