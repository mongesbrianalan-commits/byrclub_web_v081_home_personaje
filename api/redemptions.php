<?php
/**
 * Vales de premio del usuario logueado — la fuente de verdad para "Mis cupones".
 *
 * Devuelve los códigos que ganó el socio (ruleta, raspadita, etc.) leyendo la
 * tabla `redemptions`, que es la que el admin valida/canjea. Así el estado que
 * ve el cliente (Disponible / Canjeado) es SIEMPRE el real, no una copia local
 * que podría quedar desincronizada.
 *
 * Orden: primero los disponibles (más nuevos arriba), después los ya canjeados.
 */
require_once __DIR__ . '/helpers.php';

$id  = require_auth();
$pdo = db();

/* Íconos por premio (la tabla no los guarda; los derivamos acá para la UI). */
const BYR_PRIZE_ICONS = [
    'fries'         => '🍟',
    'drink'         => '🥤',
    'surprise'      => '🎁',
    'double-points' => '🍔',
    'cheese-burger' => '🧀',
    '2x1-wed'       => '🍔',
];

$stmt = $pdo->prepare(
    'SELECT code, prize_id, prize_label, source, status, created_at, redeemed_at
       FROM redemptions
      WHERE user_id = ?
      ORDER BY (status = "pending") DESC, created_at DESC'
);
$stmt->execute([$id]);
$rows = $stmt->fetchAll();

$coupons = [];
foreach ($rows as $r) {
    $coupons[] = [
        'code'       => $r['code'],
        'prizeId'    => $r['prize_id'],
        'label'      => $r['prize_label'],
        'icon'       => BYR_PRIZE_ICONS[$r['prize_id']] ?? '🎟️',
        'source'     => $r['source'],
        'status'     => $r['status'],                 // 'pending' | 'redeemed'
        'createdAt'  => $r['created_at'],
        'redeemedAt' => $r['redeemed_at'],
    ];
}

json_out(['coupons' => $coupons]);
