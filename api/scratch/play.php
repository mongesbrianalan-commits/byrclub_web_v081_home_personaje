<?php
/**
 * Raspadita diaria — el cartón del día, resuelto del lado del servidor.
 *
 * Se llama UNA vez, en el primer raspón. A partir de ahí el premio está
 * decidido y acreditado: raspar el resto es solo la animación.
 *
 *   - Controla que sea 1 raspadita por día (server-authoritative).
 *   - Sortea el premio ACÁ. El navegador ya no elige nada.
 *   - Acredita puntos/XP, desbloquea la insignia, y para los premios
 *     canjeables emite un vale con código único en la tabla `redemptions`.
 *   - Marca el día y guarda el resultado en el estado, así refrescar la
 *     página muestra el mismo premio en vez de repartir otro.
 *
 * Antes esto vivía entero en el navegador: la marca de "ya jugué" se
 * escribía recién al reclamar, así que raspar y refrescar sorteaba un
 * cartón nuevo — se podía refrescar hasta que saliera el premio deseado.
 * Y aun reclamando, el límite era localStorage: borrando los datos del
 * navegador se volvían a cobrar los puntos.
 *
 * Todo corre dentro de una transacción con la fila del usuario bloqueada
 * (SELECT ... FOR UPDATE): si alguien dispara dos peticiones a la vez, la
 * segunda espera y encuentra el día ya marcado.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../progress/engine.php';
require_once __DIR__ . '/catalog.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

if (!byr_scratch_daily_ready($pdo)) {
    json_out([
        'error' => 'La raspadita todavía no está habilitada. (Falta correr 2026-08-scratch-daily.sql.)',
        'code'  => 'scratch-not-ready',
    ], 503);
}

$today = date('Y-m-d');

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

/* Ya jugó hoy: devolvemos el MISMO cartón (idempotente). Si el navegador
   reintenta por un corte de red, no se sortea de nuevo ni se paga de nuevo. */
if (($row['last_scratch_play'] ?? null) === $today) {
    $saved = $state['games']['scratch'] ?? null;
    $pdo->commit();

    if (is_array($saved) && ($saved['date'] ?? null) === $today) {
        json_out([
            'prize' => [
                'id'         => $saved['id']         ?? null,
                'label'      => $saved['label']      ?? null,
                'icon'       => $saved['icon']       ?? '🎁',
                'points'     => (int) ($saved['points'] ?? 0),
                'xp'         => (int) ($saved['xp']     ?? 0),
                'redeemable' => (bool) ($saved['redeemable'] ?? false),
                'code'       => $saved['code'] ?? null,
            ],
            'state'  => $state,
            'reused' => true,
        ]);
    }
    json_out(['error' => 'Ya jugaste hoy. Volvé mañana.', 'code' => 'already-played'], 409);
}

/* --- Sorteo (acá manda el servidor) --- */
$prize = byr_scratch_draw();

/* Puntos / XP */
/* Antes de acreditar: si es una cuenta vieja, reconocemos lo que ya
   habia logrado con el motor del navegador, para no pagarselo dos
   veces. Va ACA y no despues, o esta misma jugada quedaria contada
   como "vieja" y el logro no se pagaria. */
byr_progress_seed($pdo, $id, $state);

byr_grant($state, (int) $prize['points'], (int) $prize['xp'], 'Raspadita diaria: ' . $prize['label'], 'scratch');

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
            'source'     => 'Raspadita diaria',
            'unlockedAt' => date('c'),
        ]));
    }
}

/* Premio canjeable → vale con código único, guardado en la tabla. */
$code = null;
if (!empty($prize['redeemable'])) {
    $code = byr_generate_redemption_code($pdo);
    $ins  = $pdo->prepare(
        'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, expires_at)
         VALUES (?, ?, ?, ?, ?, "pending", DATE_ADD(NOW(), INTERVAL ? HOUR))'
    );
    $ins->execute([$id, $code, $prize['id'], $prize['label'], 'Raspadita diaria', BYR_REDEMPTION_TTL_HOURS]);

    /* Lo dejamos también en el inventario del usuario (para que lo vea en su app). */
    if (!isset($state['inventory']) || !is_array($state['inventory'])) {
        $state['inventory'] = [];
    }
    array_unshift($state['inventory'], [
        'id'         => $prize['id'],
        'label'      => $prize['label'],
        'icon'       => $prize['icon'],
        'code'       => $code,
        'source'     => 'Raspadita diaria',
        'status'     => 'available',
        'obtainedAt' => date('c'),
    ]);
}

/* El cartón de hoy, para poder repintarlo si refresca la página. */
if (!isset($state['games']) || !is_array($state['games'])) {
    $state['games'] = [];
}
$state['games']['scratch'] = [
    'date'       => $today,
    'id'         => $prize['id'],
    'label'      => $prize['label'],
    'icon'       => $prize['icon'],
    'points'     => (int) $prize['points'],
    'xp'         => (int) $prize['xp'],
    'redeemable' => (bool) $prize['redeemable'],
    'code'       => $code,
];

/* Estado + marca del día en un solo UPDATE. */
/* Jugar puede desbloquear un logro ("A raspar", "Fan de la ruleta") o
   completar una mision del dia. Lo evalua el servidor, aca mismo, para
   que los puntos caigan junto con los del juego. */
$news = byr_progress_evaluate($pdo, $id, $state);

$upd = $pdo->prepare('UPDATE users SET state = ?, last_scratch_play = ? WHERE id = ?');
$upd->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $today, $id]);

$pdo->commit();

json_out([
    'prize'  => byr_scratch_public($prize, $code),
    'state'  => $state,
    'reused' => false,

    /* Logros y misiones que se desbloquearon con esta jugada. */
    'unlocked'  => $news['unlocked'],
    'completed' => $news['completed'],
]);
