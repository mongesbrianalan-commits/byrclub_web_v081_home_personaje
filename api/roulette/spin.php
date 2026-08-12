<?php
/**
 * Giro de la ruleta diaria — resuelto del lado del servidor.
 *   - Controla que sea 1 giro por día (server-authoritative).
 *   - Elige el premio (no lo decide el cliente → no se puede falsear).
 *   - Acredita puntos/XP, o genera un vale con código único para los
 *     premios canjeables (papas, bebida, sorpresa, 2x puntos).
 * Devuelve el índice del premio (para animar la rueda), sus datos, el
 * código (si corresponde) y el estado actualizado.
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

/* Catálogo autoritativo — MISMO orden que el array `prizes` del cliente. */
$WHEEL = [
    ['id' => 'points-50',     'label' => '50 puntos',         'icon' => '⭐', 'description' => 'Sumaste 50 puntos para seguir avanzando en BYR Club.',        'points' => 50,  'xp' => 25, 'redeemable' => false],
    ['id' => 'fries',         'label' => 'Papas gratis',      'icon' => '🍟', 'description' => 'Desbloqueaste una porción de papas para canjear en BYR.',       'points' => 0,   'xp' => 20, 'redeemable' => true],
    ['id' => 'points-100',    'label' => '100 puntos',        'icon' => '⭐', 'description' => 'Sumaste 100 puntos a tu progreso de BYR Club.',                'points' => 100, 'xp' => 35, 'redeemable' => false],
    ['id' => 'surprise',      'label' => 'Premio sorpresa',   'icon' => '🎁', 'description' => 'Ganaste una sorpresa especial. Mostrá el código en el local.',  'points' => 0,   'xp' => 25, 'redeemable' => true],
    ['id' => 'points-250',    'label' => '250 puntos',        'icon' => '🌟', 'description' => '¡Premio grande! Sumaste 250 puntos a tu perfil.',              'points' => 250, 'xp' => 50, 'redeemable' => false],
    ['id' => 'drink',         'label' => 'Bebida gratis',     'icon' => '🥤', 'description' => 'Desbloqueaste una bebida para tu próxima hamburguesa.',        'points' => 0,   'xp' => 20, 'redeemable' => true],
    ['id' => 'double-points', 'label' => '2x puntos',         'icon' => '🍔', 'description' => 'Tu próxima compra suma el doble de puntos. Mostrá el código.',  'points' => 0,   'xp' => 30, 'redeemable' => true],
    ['id' => 'badge',         'label' => 'Insignia exclusiva','icon' => '💎', 'description' => 'Desbloqueaste una insignia especial para tu perfil.',          'points' => 0,   'xp' => 40, 'redeemable' => false, 'achievement' => ['id' => 'roulette-exclusive-badge', 'label' => 'Insignia exclusiva', 'icon' => '💎']],
];
$WEIGHTS = [0, 0, 0, 1, 2, 2, 2, 3, 4, 5, 6, 7];

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'Usuario no encontrado.'], 404);
}

$today = date('Y-m-d');
if (($row['last_roulette_spin'] ?? null) === $today) {
    json_out(['error' => 'Ya giraste hoy. Volvé mañana.', 'code' => 'already-spun'], 409);
}

/* Elegimos el premio (igual que el cliente, pero acá manda el servidor). */
$index = $WEIGHTS[random_int(0, count($WEIGHTS) - 1)];
$prize = $WHEEL[$index];

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($row['name'], $row['avatar']);
if (!is_array($state)) {
    $state = default_state($row['name'], $row['avatar']);
}

/* Puntos / XP */
byr_grant($state, (int) $prize['points'], (int) $prize['xp'], 'Ruleta diaria: ' . $prize['label'], 'roulette');

/* Insignia (logro digital, sin código) */
if (!empty($prize['achievement'])) {
    if (!isset($state['achievements']) || !is_array($state['achievements'])) {
        $state['achievements'] = [];
    }
    $already = false;
    foreach ($state['achievements'] as $a) {
        if (($a['id'] ?? null) === $prize['achievement']['id']) {
            $already = true;
            break;
        }
    }
    if (!$already) {
        array_unshift($state['achievements'], array_merge($prize['achievement'], [
            'source'     => 'Ruleta diaria',
            'unlockedAt' => date('c'),
        ]));
    }
}

/* Premio canjeable → vale con código único, guardado en la tabla. */
$code = null;
if (!empty($prize['redeemable'])) {
    $code = byr_generate_redemption_code($pdo);
    $ins = $pdo->prepare(
        'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, expires_at)
         VALUES (?, ?, ?, ?, ?, "pending", DATE_ADD(NOW(), INTERVAL ? HOUR))'
    );
    $ins->execute([$id, $code, $prize['id'], $prize['label'], 'Ruleta diaria', BYR_REDEMPTION_TTL_HOURS]);

    /* Lo dejamos también en el inventario del usuario (para que lo vea en su app). */
    if (!isset($state['inventory']) || !is_array($state['inventory'])) {
        $state['inventory'] = [];
    }
    array_unshift($state['inventory'], [
        'id'         => $prize['id'],
        'label'      => $prize['label'],
        'icon'       => $prize['icon'],
        'code'       => $code,
        'source'     => 'Ruleta diaria',
        'status'     => 'available',
        'obtainedAt' => date('c'),
    ]);
}

/* Guardamos estado + marca de giro de hoy (atómico para el límite diario). */
$upd = $pdo->prepare('UPDATE users SET state = ?, last_roulette_spin = ? WHERE id = ?');
$upd->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $today, $id]);

json_out([
    'prize' => [
        'index'       => $index,
        'id'          => $prize['id'],
        'label'       => $prize['label'],
        'icon'        => $prize['icon'],
        'description' => $prize['description'],
        'redeemable'  => (bool) $prize['redeemable'],
    ],
    'code'  => $code,
    'state' => $state,
]);
