<?php
/** Crea una cuenta nueva y deja la sesión iniciada (sin onboarding aún). */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$in       = body_json();
$name     = trim($in['name'] ?? '');
$email    = strtolower(trim($in['email'] ?? ''));
$whatsapp = trim($in['whatsapp'] ?? '');
$password = (string) ($in['password'] ?? '');

$errors = [];
if ($name === '') {
    $errors['name'] = 'Decinos cómo te llamás.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Escribí un email válido.';
}
if ($whatsapp === '') {
    $errors['whatsapp'] = 'Necesitamos tu WhatsApp para avisarte de premios.';
}
if (strlen($password) < 6) {
    $errors['password'] = 'La contraseña necesita al menos 6 caracteres.';
}
if ($errors) {
    json_out(['error' => reset($errors), 'code' => 'validation', 'errors' => $errors], 422);
}

$pdo = db();

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    json_out(['error' => 'Ya existe una cuenta con ese email. Probá ingresar.', 'code' => 'email-taken'], 409);
}

$hash  = password_hash($password, PASSWORD_DEFAULT);
$state = default_state($name, null);

$stmt = $pdo->prepare(
    'INSERT INTO users (email, password_hash, name, whatsapp, avatar, state) VALUES (?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    $email,
    $hash,
    $name,
    $whatsapp,
    null,
    json_encode($state, JSON_UNESCAPED_UNICODE),
]);

$id = (int) $pdo->lastInsertId();
$_SESSION['user_id'] = $id;

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
json_out(['user' => public_user($stmt->fetch())]);
