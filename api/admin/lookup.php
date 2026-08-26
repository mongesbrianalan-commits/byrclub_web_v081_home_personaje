<?php
/**
 * Busca un usuario por EMAIL o por NÚMERO DE WHATSAPP y devuelve sus datos
 * + puntos. Solo admin. La búsqueda por teléfono sirve para cargar puntos de
 * pedidos de delivery (donde se conoce el número, no el email).
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../perks/2x1.php';
require_method('POST');

$pdo = db();
require_role($pdo, ['cajero']);

/** Arma la tarjeta que muestra el admin (sin datos sensibles). */
function admin_user_card(PDO $pdo, array $row): array
{
    $state = !empty($row['state']) ? json_decode($row['state'], true) : [];

    return [
        'email'    => $row['email'],
        'name'     => $row['name'],
        'avatar'   => $row['avatar'],
        'whatsapp' => $row['whatsapp'],
        'points'   => $state['wallet']['points'] ?? 0,
        'xp'       => $state['progression']['xp'] ?? 0,
        'role'     => !empty($row['is_admin']) ? 'admin' : ($row['role'] ?? 'socio'),

        /* El 2x1 de hoy: si ya lo usó y cómo. Es lo que hay que mirar cuando
           alguien llega al local y lo pide sin mostrar nada — sin esto el
           cajero no tiene forma de saber que ya lo pidió por la web. */
        'perk2x1'  => byr_2x1_status($pdo, (int) $row['id']),
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
    json_out(['user' => admin_user_card($pdo, $row)]);
}

/* ---- Búsqueda por WHATSAPP (número) ---- */
$digits = preg_replace('/\D/', '', $q);
if (strlen($digits) < 6) {
    json_out(['error' => 'Poné el número de WhatsApp completo, o buscá por email.'], 422);
}
$last = substr($digits, -8); // comparamos por los últimos 8 dígitos (ignora código de país y formato)

/*
 * Normalizamos el WhatsApp guardado (sacando espacios, guiones, +, paréntesis
 * y puntos) y buscamos que TERMINE en los últimos 8 dígitos. El patrón del LIKE
 * se arma en PHP ($last son solo dígitos, sin riesgo de inyección ni comodines)
 * en vez de con CONCAT, para no depender de cómo PDO liga parámetros dentro de
 * funciones con prepared statements nativos.
 */
$pattern = '%' . $last;

$sql = "SELECT * FROM users
         WHERE whatsapp IS NOT NULL AND whatsapp <> ''
           AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(whatsapp,' ',''),'-',''),'+',''),'(',''),')',''),'.','')
               LIKE ?";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$pattern]);
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    /*
     * 42S22 = "Unknown column". Pasa si la base se creó con un esquema viejo
     * que todavía no tiene la columna `whatsapp` (el CREATE TABLE IF NOT EXISTS
     * no la agrega a una tabla ya creada). Se soluciona con un ALTER TABLE.
     */
    if ($e->getCode() === '42S22') {
        json_out([
            'error' => 'La base de datos todavía no tiene la columna de WhatsApp, '
                     . 'por eso no se puede buscar por número. Buscá por email por ahora; '
                     . 'hay que agregar esa columna en la base.',
            'code'  => 'missing-whatsapp-column',
        ], 500);
    }

    json_out([
        'error'  => 'No se pudo buscar por WhatsApp en este momento. Probá con el email.',
        'code'   => 'db-error',
        'detail' => $e->getMessage(),
    ], 500);
}

if (!$rows) {
    json_out(['error' => 'No hay ninguna cuenta registrada con ese WhatsApp. Probá con el email.', 'code' => 'not-found'], 404);
}
if (count($rows) === 1) {
    json_out(['user' => admin_user_card($pdo, $rows[0])]);
}

/* Varias cuentas con ese número: que el admin elija. */
json_out(['matches' => array_map(function (array $r) use ($pdo) {
    return admin_user_card($pdo, $r);
}, $rows)]);
