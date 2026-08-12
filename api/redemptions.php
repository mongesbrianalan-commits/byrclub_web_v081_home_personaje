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
    'prode-winner'  => '🏆',
];

/* secondsLeft lo calcula el SERVER (NOW() de la base), así el contador del
   cliente no depende del reloj ni la zona horaria del celular. NULL = no vence. */
$stmt = $pdo->prepare(
    'SELECT code, prize_id, prize_label, source, status, created_at, expires_at, redeemed_at,
            CASE WHEN expires_at IS NULL THEN NULL
                 ELSE TIMESTAMPDIFF(SECOND, NOW(), expires_at) END AS seconds_left
       FROM redemptions
      WHERE user_id = ?
      ORDER BY (status = "pending") DESC, created_at DESC'
);
$stmt->execute([$id]);
$rows = $stmt->fetchAll();

$coupons = [];
foreach ($rows as $r) {
    $secondsLeft = $r['seconds_left'] === null ? null : (int) $r['seconds_left'];
    // Un vale vencido es uno pendiente cuyo plazo ya pasó.
    $expired = $r['status'] === 'pending' && $secondsLeft !== null && $secondsLeft <= 0;
    $coupons[] = [
        'code'        => $r['code'],
        'prizeId'     => $r['prize_id'],
        'label'       => $r['prize_label'],
        'icon'        => BYR_PRIZE_ICONS[$r['prize_id']] ?? '🎟️',
        'source'      => $r['source'],
        'status'      => $r['status'],                 // 'pending' | 'redeemed'
        'createdAt'   => $r['created_at'],
        'expiresAt'   => $r['expires_at'],             // null = no vence
        'secondsLeft' => $secondsLeft,                 // null = no vence; <=0 = vencido
        'expired'     => $expired,
        'redeemedAt'  => $r['redeemed_at'],
    ];
}

json_out(['coupons' => $coupons]);
