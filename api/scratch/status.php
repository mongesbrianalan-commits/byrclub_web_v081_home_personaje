<?php
/**
 * Raspadita diaria — estado de hoy, antes de empezar a raspar.
 *   ready       → está corrida la migración del límite diario.
 *   playedToday → este socio ya jugó hoy (lo dice la base, no el navegador).
 *   prize       → si ya jugó, el premio de hoy (para volver a mostrarlo con
 *                 su código en vez de sortear otro).
 *
 * Sirve para que refrescar la página NO reparta un cartón nuevo.
 */
require_once __DIR__ . '/../helpers.php';
require_method('GET');

$id  = require_auth();
$pdo = db();

if (!byr_scratch_daily_ready($pdo)) {
    json_out(['ready' => false, 'playedToday' => false, 'prize' => null]);
}

$stmt = $pdo->prepare('SELECT state, last_scratch_play FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

$today  = date('Y-m-d');
$played = (($row['last_scratch_play'] ?? null) === $today);

$prize = null;
if ($played) {
    $state = !empty($row['state']) ? json_decode($row['state'], true) : null;
    $saved = is_array($state) ? ($state['games']['scratch'] ?? null) : null;

    /* Solo devolvemos el guardado si es efectivamente el de hoy. */
    if (is_array($saved) && ($saved['date'] ?? null) === $today) {
        $prize = [
            'id'         => $saved['id']         ?? null,
            'label'      => $saved['label']      ?? null,
            'icon'       => $saved['icon']       ?? '🎁',
            'points'     => (int) ($saved['points'] ?? 0),
            'xp'         => (int) ($saved['xp']     ?? 0),
            'redeemable' => (bool) ($saved['redeemable'] ?? false),
            'code'       => $saved['code'] ?? null,
        ];
    }
}

json_out([
    'ready'       => true,
    'playedToday' => $played,
    'prize'       => $prize,
]);
