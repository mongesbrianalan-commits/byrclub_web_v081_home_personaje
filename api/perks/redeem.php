<?php
/**
 * Canje de una recompensa de la pagina Beneficios, con los puntos del socio.
 *
 * Antes esto no existia: beneficios.js restaba los puntos en el navegador y
 * mostraba "✓ ¡Canjeado!". No quedaba registro, el admin no tenia nada que
 * validar y el socio no tenia nada que mostrar en el local — y al recargar
 * la pagina los puntos volvian.
 *
 * Ahora funciona como los premios de la ruleta: el servidor cobra los
 * puntos y emite un vale con codigo unico en la tabla `redemptions`, que el
 * admin valida desde el panel. El precio y el nivel los pone el servidor
 * (api/perks/catalog.php), no el HTML: cambiar el data-points en el
 * navegador no abarata nada.
 *
 * El precio ya no es un numero escrito a mano: se calcula desde la carta,
 * asi que hay que pedirlo DESPUES de tener la conexion (byr_perk_rewards).
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/catalog.php';
require_once __DIR__ . '/../progress/engine.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$in       = body_json();
$rewardId = trim((string) ($in['rewardId'] ?? ''));

$rewards = byr_perk_rewards($pdo);
if (!isset($rewards[$rewardId])) {
    json_out(['error' => 'Esa recompensa no existe.', 'code' => 'unknown-reward'], 422);
}

$reward = $rewards[$rewardId];

$pdo->beginTransaction();

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) {
    $pdo->rollBack();
    json_out(['error' => 'Usuario no encontrado.'], 404);
}

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($row['name'], $row['avatar']);
if (!is_array($state)) {
    $state = default_state($row['name'], $row['avatar']);
}

/* Cuenta vieja: reconocer lo ya logrado antes de tocar nada. */
byr_progress_seed($pdo, $id, $state);

$level  = byr_level_from_xp((int) ($state['progression']['xp'] ?? 0));
$points = (int) ($state['wallet']['points'] ?? 0);

if ($level < (int) $reward['level']) {
    $pdo->rollBack();
    json_out([
        'error' => 'Te falta llegar al nivel ' . $reward['level'] . ' para canjear ' . $reward['label'] . '.',
        'code'  => 'level-locked',
        'level' => $level,
    ], 409);
}

if (!byr_spend($state, (int) $reward['points'], 'Canje: ' . $reward['label'])) {
    $pdo->rollBack();
    json_out([
        'error'   => 'Te faltan ' . ((int) $reward['points'] - $points) . ' puntos para ' . $reward['label'] . '.',
        'code'    => 'not-enough-points',
        'points'  => $points,
        'needed'  => (int) $reward['points'],
    ], 409);
}

/* Vale con codigo unico, igual que los premios de la ruleta. Le damos el
   plazo largo: no es lo mismo un premio regalado que algo que costo 8.000
   puntos y capaz se canjea el fin de semana. */
$code = byr_generate_redemption_code($pdo);
$ins  = $pdo->prepare(
    'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, expires_at)
     VALUES (?, ?, ?, ?, ?, "pending", DATE_ADD(NOW(), INTERVAL ? HOUR))'
);
$ins->execute([$id, $code, $rewardId, $reward['label'], 'Canje de puntos', BYR_REDEMPTION_TTL_HOURS_SPECIAL]);

if (!isset($state['inventory']) || !is_array($state['inventory'])) {
    $state['inventory'] = [];
}
array_unshift($state['inventory'], [
    'id'         => $rewardId,
    'label'      => $reward['label'],
    'icon'       => $reward['icon'],
    'code'       => $code,
    'source'     => 'Canje de puntos',
    'status'     => 'available',
    'obtainedAt' => date('c'),
]);

/* Canjear puede desbloquear "Premio desbloqueado" o "Coleccionista". */
$news = byr_progress_evaluate($pdo, $id, $state);

$upd = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
$upd->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $id]);

$pdo->commit();

json_out([
    'ok'        => true,
    'code'      => $code,
    'rewardId'  => $rewardId,
    'label'     => $reward['label'],
    'icon'      => $reward['icon'],
    'spent'     => (int) $reward['points'],
    'state'     => $state,
    'unlocked'  => $news['unlocked'],
    'completed' => $news['completed'],
]);
