<?php
/**
 * Busca un usuario por EMAIL o por NÚMERO DE WHATSAPP y devuelve sus datos
 * + puntos. Solo admin. La búsqueda por teléfono sirve para cargar puntos de
 * pedidos de delivery (donde se conoce el número, no el email).
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

/** Arma la tarjeta que muestra el admin (sin datos sensibles). */
function admin_user_card(array $row): array
{
    $state = !empty($row['state']) ? json_decode($row['state'], true) : [];
    return [
        'email'    => $row['email'],
        'name'     => $row['name'],
        'avatar'   => $row['avatar'],
        'whatsapp' => $row['whatsapp'],
        'points'   => $state['wallet']['points'] ?? 0,
        'xp'       => $state['progression']['xp'] ?? 0,
    ];
}

$in = body_json();
$q  = trim($in['query'] ?? $in['email'] ?? '');
if ($q === '') {
    json_out(['error' => 'Escribí un email o número de WhatsApp.'], 422);
}

/* ---- Búsqueda por EMAIL (si tiene @) ---- */
if (strpos($q, '@') !== false) {
    $email = strtolower($q);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['error' => 'Email inválido.'], 422);
    }
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    if (!$row) {
        json_out(['error' => 'No hay ningún usuario con ese email.', 'code' => 'not-found'], 404);
    }
    json_out(['user' => admin_user_card($row)]);
}

/* ---- Búsqueda por WHATSAPP (número) ---- */
$digits = preg_replace('/\D/', '', $q);
if (strlen($digits) < 6) {
    json_out(['error' => 'Poné el número de WhatsApp completo, o buscá por email.'], 422);
}
$last = substr($digits, -8); // comparamos por los últimos 8 dígitos (ignora código de país y formato)

$sql = "SELECT * FROM users
         WHERE whatsapp IS NOT NULL AND whatsapp <> ''
           AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(whatsapp,' ',''),'-',''),'+',''),'(',''),')',''),'.','')
               LIKE CONCAT('%', ?, '%')";
$stmt = $pdo->prepare($sql);
$stmt->execute([$last]);
$rows = $stmt->fetchAll();

if (!$rows) {
    json_out(['error' => 'No hay ninguna cuenta registrada con ese WhatsApp. Probá con el email.', 'code' => 'not-found'], 404);
}
if (count($rows) === 1) {
    json_out(['user' => admin_user_card($rows[0])]);
}

/* Varias cuentas con ese número: que el admin elija. */
json_out(['matches' => array_map('admin_user_card', $rows)]);
