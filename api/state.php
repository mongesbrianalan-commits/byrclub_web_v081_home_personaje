<?php
/**
 * Estado de juego del usuario logueado.
 *   GET  -> devuelve el estado guardado.
 *   POST -> guarda el estado recibido (puntos, xp, inventario, etc.).
 *
 * Nota: en esta versión el cliente envía su estado y el servidor lo
 * guarda. Es simple y suficiente para arrancar. Las cargas de puntos
 * "oficiales" (por compra) se hacen desde admin/award.php, del lado
 * del servidor, que es la vía confiable.
 */
require_once __DIR__ . '/helpers.php';

$id     = require_auth();
$pdo    = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT state FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    json_out(['state' => (!empty($row['state']) ? json_decode($row['state'], true) : null)]);
}

if ($method === 'POST') {
    $in    = body_json();
    $state = $in['state'] ?? null;
    if (!is_array($state)) {
        json_out(['error' => 'Estado inválido.'], 422);
    }

    $json   = json_encode($state, JSON_UNESCAPED_UNICODE);
    $name   = $state['profile']['name'] ?? null;
    $avatar = $state['profile']['avatar'] ?? null;

    if ($name !== null && $avatar !== null) {
        $stmt = $pdo->prepare('UPDATE users SET state = ?, name = ?, avatar = ? WHERE id = ?');
        $stmt->execute([$json, $name, $avatar, $id]);
    } else {
        $stmt = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
        $stmt->execute([$json, $id]);
    }

    json_out(['ok' => true]);
}

json_out(['error' => 'Método no permitido.'], 405);
