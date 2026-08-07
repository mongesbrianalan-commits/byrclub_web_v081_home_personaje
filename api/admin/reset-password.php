<?php
/**
 * Restablece la contraseña de un usuario. Solo para administradores.
 *
 * Las contraseñas se guardan hasheadas (bcrypt), así que NO se puede recuperar
 * la original. Cuando un cliente se la olvida, el admin le asigna una nueva
 * temporal desde el panel y se la pasa por WhatsApp para que después la cambie.
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

$in       = body_json();
$email    = strtolower(trim($in['email'] ?? ''));
$password = (string) ($in['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['error' => 'Email inválido.'], 422);
}
if (strlen($password) < 6) {
    json_out(['error' => 'La contraseña necesita al menos 6 caracteres.'], 422);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No hay ningún usuario con ese email.', 'code' => 'not-found'], 404);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->execute([$hash, (int) $row['id']]);

json_out([
    'ok'   => true,
    'user' => [
        'email'    => $row['email'],
        'name'     => $row['name'],
        'whatsapp' => $row['whatsapp'],
    ],
]);
