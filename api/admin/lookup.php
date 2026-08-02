<?php
/** Busca un usuario por email y devuelve sus datos + puntos. Solo admin. */
require_once __DIR__ . '/../helpers.php';
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
$email = strtolower(trim($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['error' => 'Email inválido.'], 422);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No hay ningún usuario con ese email.'], 404);
}

$state = !empty($row['state']) ? json_decode($row['state'], true) : [];

json_out([
    'user' => [
        'email'    => $row['email'],
        'name'     => $row['name'],
        'avatar'   => $row['avatar'],
        'whatsapp' => $row['whatsapp'],
        'points'   => $state['wallet']['points'] ?? 0,
        'xp'       => $state['progression']['xp'] ?? 0,
    ],
]);
