<?php
/** Guarda el personaje (avatar) y el nombre elegidos en el onboarding. */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$id  = require_auth();
$in  = body_json();
$name   = trim($in['name'] ?? '');
$avatar = trim($in['avatar'] ?? '');
if ($avatar === '') {
    $avatar = '🍔';
}

/* Cumpleaños (opcional). Aceptamos solo formato YYYY-MM-DD; cualquier
   otra cosa se ignora y queda null. */
$birthdateIn = trim($in['birthdate'] ?? '');
$birthdate   = null;
if ($birthdateIn !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthdateIn)) {
    [$y, $m, $d] = array_map('intval', explode('-', $birthdateIn));
    if (checkdate($m, $d, $y) && $y >= 1900 && $y <= (int) date('Y')) {
        $birthdate = $birthdateIn;
    }
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'Usuario no encontrado.'], 404);
}

if ($name === '') {
    $name = $row['name'];
}

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($name, $avatar);
$state['profile']['name']   = $name;
$state['profile']['avatar'] = $avatar;

/* Guardamos el cumpleaños solo si vino uno válido; si no, mantenemos
   el que ya hubiera (no lo borramos). */
if ($birthdate !== null) {
    $state['profile']['birthdate'] = $birthdate;
    $stmt = $pdo->prepare('UPDATE users SET name = ?, avatar = ?, state = ?, birthdate = ? WHERE id = ?');
    $stmt->execute([$name, $avatar, json_encode($state, JSON_UNESCAPED_UNICODE), $birthdate, $id]);
} else {
    $stmt = $pdo->prepare('UPDATE users SET name = ?, avatar = ?, state = ? WHERE id = ?');
    $stmt->execute([$name, $avatar, json_encode($state, JSON_UNESCAPED_UNICODE), $id]);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
json_out(['user' => public_user($stmt->fetch())]);
