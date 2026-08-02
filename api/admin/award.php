<?php
/**
 * Carga puntos/XP a un usuario por email. Solo para administradores.
 * Es la vía "oficial" y confiable para dar puntos (p. ej. por una compra),
 * porque se resuelve del lado del servidor.
 */
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

$in     = body_json();
$email  = strtolower(trim($in['email'] ?? ''));
$points = (int) ($in['points'] ?? 0);
$xp     = (int) ($in['xp'] ?? 0);
$reason = trim($in['reason'] ?? 'Carga manual');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['error' => 'Email inválido.'], 422);
}
if ($points === 0 && $xp === 0) {
    json_out(['error' => 'Indicá al menos puntos o XP.'], 422);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No hay ningún usuario con ese email.'], 404);
}

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($row['name'], $row['avatar']);

$state['wallet']['points']   = ($state['wallet']['points'] ?? 0) + $points;
$state['progression']['xp']  = ($state['progression']['xp'] ?? 0) + $xp;

if (!isset($state['history']) || !is_array($state['history'])) {
    $state['history'] = [];
}
array_unshift($state['history'], [
    'type'   => 'admin',
    'points' => $points,
    'xp'     => $xp,
    'reason' => $reason,
    'date'   => date('c'),
]);

$stmt = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
$stmt->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $row['id']]);

json_out([
    'ok'   => true,
    'user' => [
        'email'  => $row['email'],
        'name'   => $row['name'],
        'points' => $state['wallet']['points'],
        'xp'     => $state['progression']['xp'],
    ],
]);
