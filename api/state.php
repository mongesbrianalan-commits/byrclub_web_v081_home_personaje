<?php
/**
 * Estado de juego del usuario logueado.
 *   GET  -> devuelve el estado guardado.
 *   POST -> guarda SOLO los campos que le pertenecen al cliente.
 *
 * Antes este endpoint guardaba el estado entero que le mandaba el
 * navegador. Era la causa de fondo de que se pudieran acreditar puntos sin
 * jugar a nada: alcanzaba con un POST con los puntos que uno quisiera. Y
 * como api/ranking.php arma la tabla leyendo ese mismo estado, el ranking
 * era forjable.
 *
 * Ahora hay una linea clara:
 *
 *   Del SERVIDOR (el cliente no los puede tocar por ninguna via):
 *     wallet, progression, inventory, achievements, history, games, missions
 *
 *   Del CLIENTE (cosmeticos, no valen nada):
 *     profile.name, profile.avatar
 *
 * Lo que llegue por POST fuera de esa lista se ignora en silencio, no se
 * rechaza: state-sync.js empuja el estado completo cada vez que algo
 * cambia y no tiene forma de saber que campos son suyos. Rechazar el
 * pedido entero solo llenaria la consola de errores sin evitar nada.
 *
 * Los puntos, el XP y los premios se acreditan en los endpoints que
 * controlan cada cosa: api/scratch/play.php, api/roulette/spin.php,
 * api/memory/finish.php, api/progress/sync.php (logros y misiones),
 * api/perks/*, api/admin/award.php y la confirmacion de pedidos.
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
    $given = $in['state'] ?? null;
    if (!is_array($given)) {
        json_out(['error' => 'Estado inválido.'], 422);
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        $pdo->rollBack();
        json_out(['error' => 'Usuario no encontrado.'], 404);
    }

    /* Partimos SIEMPRE del estado guardado. Lo que manda el navegador no
       es el estado: son, como mucho, dos campos del perfil. */
    $state = !empty($row['state'])
        ? json_decode($row['state'], true)
        : default_state($row['name'], $row['avatar']);
    if (!is_array($state)) {
        $state = default_state($row['name'], $row['avatar']);
    }
    if (!isset($state['profile']) || !is_array($state['profile'])) {
        $state['profile'] = ['name' => $row['name'], 'avatar' => $row['avatar']];
    }

    $name   = null;
    $avatar = null;

    if (isset($given['profile']) && is_array($given['profile'])) {
        $candidate = trim((string) ($given['profile']['name'] ?? ''));
        if ($candidate !== '' && mb_strlen($candidate) <= 40) {
            $name = $candidate;
            $state['profile']['name'] = $name;
        }

        /* El avatar es un emoji corto; cortamos por las dudas. */
        $candidate = trim((string) ($given['profile']['avatar'] ?? ''));
        if ($candidate !== '' && mb_strlen($candidate) <= 8) {
            $avatar = $candidate;
            $state['profile']['avatar'] = $avatar;
        }
    }

    $json = json_encode($state, JSON_UNESCAPED_UNICODE);

    if ($name !== null && $avatar !== null) {
        $upd = $pdo->prepare('UPDATE users SET state = ?, name = ?, avatar = ? WHERE id = ?');
        $upd->execute([$json, $name, $avatar, $id]);
    } elseif ($name !== null) {
        $upd = $pdo->prepare('UPDATE users SET state = ?, name = ? WHERE id = ?');
        $upd->execute([$json, $name, $id]);
    } elseif ($avatar !== null) {
        $upd = $pdo->prepare('UPDATE users SET state = ?, avatar = ? WHERE id = ?');
        $upd->execute([$json, $avatar, $id]);
    } else {
        $upd = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
        $upd->execute([$json, $id]);
    }

    $pdo->commit();

    /* Devolvemos el estado real. Si el navegador tenia una copia inflada
       (o vieja), asi se entera y se pone al dia. */
    json_out(['ok' => true, 'state' => $state]);
}

json_out(['error' => 'Método no permitido.'], 405);
