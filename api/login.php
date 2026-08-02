<?php
/** Valida credenciales y abre la sesión. */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$in       = body_json();
$email    = strtolower(trim($in['email'] ?? ''));
$password = (string) ($in['password'] ?? '');

$pdo  = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$row = $stmt->fetch();

if (!$row || !password_verify($password, $row['password_hash'])) {
    json_out(['error' => 'Email o contraseña incorrectos.', 'code' => 'invalid-credentials'], 401);
}

$_SESSION['user_id'] = (int) $row['id'];
json_out(['user' => public_user($row)]);
