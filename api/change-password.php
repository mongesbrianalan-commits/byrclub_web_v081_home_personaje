<?php
/**
 * Permite al usuario logueado cambiar su propia contraseña.
 * Verifica la contraseña actual antes de guardar la nueva.
 */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$in      = body_json();
$current = (string) ($in['currentPassword'] ?? '');
$next    = (string) ($in['newPassword'] ?? '');

if ($current === '') {
    json_out(['error' => 'Escribí tu contraseña actual.', 'code' => 'validation'], 422);
}
if (strlen($next) < 6) {
    json_out(['error' => 'La nueva contraseña necesita al menos 6 caracteres.', 'code' => 'validation'], 422);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'No encontramos tu cuenta.', 'code' => 'not-found'], 404);
}

if (!password_verify($current, $row['password_hash'])) {
    json_out(['error' => 'Tu contraseña actual no es correcta.', 'code' => 'wrong-password'], 403);
}

$hash = password_hash($next, PASSWORD_DEFAULT);
$stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->execute([$hash, (int) $id]);

json_out(['ok' => true]);
