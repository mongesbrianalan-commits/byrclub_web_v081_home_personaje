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
require_once __DIR__ . '/../progress/engine.php';
require_once __DIR__ . '/catalog.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

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

/* Elegimos el premio (igual que el cliente, pero acá manda el servidor).
   La rueda y sus pesos viven en catalog.php, que es lo que lee también
   el reporte de cupones del panel. */
[$index, $prize] = byr_wheel_draw();

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($row['name'], $row['avatar']);
if (!is_array($state)) {
    $state = default_state($row['name'], $row['avatar']);
}

/* Puntos / XP */
/* Antes de acreditar: si es una cuenta vieja, reconocemos lo que ya
   habia logrado con el motor del navegador, para no pagarselo dos
   veces. Va ACA y no despues, o esta misma jugada quedaria contada
   como "vieja" y el logro no se pagaria. */
byr_progress_seed($pdo, $id, $state);

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
/* Jugar puede desbloquear un logro ("A raspar", "Fan de la ruleta") o
   completar una mision del dia. Lo evalua el servidor, aca mismo, para
   que los puntos caigan junto con los del juego. */
$news = byr_progress_evaluate($pdo, $id, $state);

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

    /* Logros y misiones que se desbloquearon con esta jugada. */
    'unlocked'  => $news['unlocked'],
    'completed' => $news['completed'],
]);
