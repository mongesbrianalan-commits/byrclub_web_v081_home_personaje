<?php
/**
 * Registra un vale de premio canjeable ganado en un juego del cliente
 * (hoy: la raspadita). El código se genera EN EL SERVIDOR y se guarda en la
 * tabla `redemptions`, de modo que el admin lo pueda validar/canjear igual
 * que los de la ruleta. Antes, la raspadita generaba el código solo en el
 * navegador y quedaba fuera de la base → el admin no podía validarlo.
 *
 * El cliente sigue sumando puntos/XP por su cuenta (state-sync); acá solo se
 * emite el código del vale. Se valida contra una lista blanca de premios
 * canjeables y se limita a UN vale por juego por día (idempotente: si ya hay
 * uno de hoy para esa fuente, se devuelve el mismo código en vez de crear otro).
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

/* Premios canjeables permitidos (id => etiqueta oficial). El label lo pone el
   servidor, no el cliente, para que no se pueda falsear qué se ganó. */
const BYR_REDEEMABLE_PRIZES = [
    'fries'         => 'Papas gratis',
    'drink'         => 'Bebida gratis',
    'surprise'      => 'Premio sorpresa',
    'cheese-burger' => 'Cheese Burger gratis',
    'double-points' => '2x puntos',
];

/* Fuentes de juego permitidas (para el campo `source` y el límite diario). */
const BYR_GAME_SOURCES = [
    'scratch' => 'Raspadita diaria',
];

$in       = body_json();
$prizeId  = trim($in['prizeId'] ?? '');
$sourceId = trim($in['source'] ?? 'scratch');

if (!isset(BYR_REDEEMABLE_PRIZES[$prizeId])) {
    json_out([
        'error'      => 'Ese premio no es canjeable.',
        'code'       => 'not-redeemable',
        'redeemable' => false,
    ], 422);
}
if (!isset(BYR_GAME_SOURCES[$sourceId])) {
    json_out(['error' => 'Origen de premio inválido.'], 422);
}

$prizeLabel = BYR_REDEEMABLE_PRIZES[$prizeId];
$source     = BYR_GAME_SOURCES[$sourceId];

/* Límite diario: si el socio ya tiene un vale de esta fuente hoy, devolvemos
   ese mismo (idempotente) en lugar de emitir uno nuevo. Evita duplicados por
   doble click o reintentos, y respeta el "una vez por día" del juego. */
$dup = $pdo->prepare(
    'SELECT code, prize_id, prize_label, status
       FROM redemptions
      WHERE user_id = ? AND source = ? AND DATE(created_at) = CURDATE()
      ORDER BY created_at DESC
      LIMIT 1'
);
$dup->execute([$id, $source]);
if ($existing = $dup->fetch()) {
    json_out([
        'ok'         => true,
        'code'       => $existing['code'],
        'prizeId'    => $existing['prize_id'],
        'label'      => $existing['prize_label'],
        'status'     => $existing['status'],
        'redeemable' => true,
        'reused'     => true,
    ]);
}

/* Nuevo vale con código único server-side. */
$code = byr_generate_redemption_code($pdo);
$ins  = $pdo->prepare(
    'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status)
     VALUES (?, ?, ?, ?, ?, "pending")'
);
$ins->execute([$id, $code, $prizeId, $prizeLabel, $source]);

json_out([
    'ok'         => true,
    'code'       => $code,
    'prizeId'    => $prizeId,
    'label'      => $prizeLabel,
    'status'     => 'pending',
    'redeemable' => true,
    'reused'     => false,
]);
