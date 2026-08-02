<?php
/** Devuelve el usuario de la sesión actual (o null si no hay). */
require_once __DIR__ . '/helpers.php';

$id = current_user_id();
if (!$id) {
    json_out(['user' => null]);
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row) {
    session_destroy();
    json_out(['user' => null]);
}

json_out(['user' => public_user($row)]);
