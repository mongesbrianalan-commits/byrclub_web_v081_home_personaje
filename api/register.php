<?php
/** Crea una cuenta nueva y deja la sesión iniciada (sin onboarding aún). */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$in       = body_json();
$name     = trim($in['name'] ?? '');
$email    = strtolower(trim($in['email'] ?? ''));
$whatsapp = trim($in['whatsapp'] ?? '');
$password = (string) ($in['password'] ?? '');
$refInput = strtoupper(preg_replace('/\s+/', '', (string) ($in['referralCode'] ?? '')));

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

/* -----------------------------------------------------------------
   ¿Vino invitado? Buscamos al que lo invitó por su código.
   Todo esto es "a prueba de fallos": si el código no existe o algo
   falla, simplemente NO se da el bonus de referido, pero el registro
   sigue normal.
----------------------------------------------------------------- */
$referrer = null;
if ($refInput !== '') {
    try {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE referral_code = ?');
        $stmt->execute([$refInput]);
        $found = $stmt->fetch();
        if ($found) {
            $referrer = $found;
        }
    } catch (Throwable $e) {
        $referrer = null;
    }
}

/* Estado inicial + bonus de bienvenida (siempre). */
$state = default_state($name, null);
byr_grant($state, BYR_WELCOME_BONUS, 0, 'Bonus de bienvenida 🎁', 'welcome');

/* Si vino invitado válido, el nuevo también recibe el bonus de referido. */
if ($referrer) {
    byr_grant($state, BYR_REFERRAL_BONUS, 0, 'Bonus por venir invitado 🤝', 'referral');
}

/* Código de invitación propio del nuevo usuario. */
$myCode = byr_generate_referral_code($pdo);
$state['profile']['referralCode'] = $myCode;

$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare(
    'INSERT INTO users (email, password_hash, name, whatsapp, avatar, state, referral_code, referred_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    $email,
    $hash,
    $name,
    $whatsapp,
    null,
    json_encode($state, JSON_UNESCAPED_UNICODE),
    $myCode,
    $referrer ? (int) $referrer['id'] : null,
]);

$id = (int) $pdo->lastInsertId();
$_SESSION['user_id'] = $id;

/* Premiamos al que invitó (best-effort: si falla, no rompe el registro). */
if ($referrer) {
    try {
        $refState = !empty($referrer['state'])
            ? json_decode($referrer['state'], true)
            : default_state($referrer['name'], $referrer['avatar']);
        if (!is_array($refState)) {
            $refState = default_state($referrer['name'], $referrer['avatar']);
        }
        byr_grant($refState, BYR_REFERRAL_BONUS, 0, 'Tu amigo ' . $name . ' se sumó al club 🤝', 'referral');
        $upd = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
        $upd->execute([json_encode($refState, JSON_UNESCAPED_UNICODE), (int) $referrer['id']]);
    } catch (Throwable $e) {
        /* El invitado ya quedó registrado con su bonus; ignoramos. */
    }
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
json_out(['user' => public_user($stmt->fetch())]);
