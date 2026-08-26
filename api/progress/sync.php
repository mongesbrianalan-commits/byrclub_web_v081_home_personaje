<?php
/**
 * Raspadita, ruleta y memotest acreditan solos cuando se juegan. Este
 * endpoint es el que corre al abrir cualquier pagina del club:
 *
 *   - marca la visita del dia y mueve la racha
 *   - recalcula logros y misiones y acredita lo que falte
 *   - devuelve el estado al dia y el progreso para dibujar la UI
 *
 * El cliente no manda NADA: no hay eventos que reportar, no hay contadores
 * que pasarle. Todo lo deduce el servidor de lo que ya sabe. Por eso este
 * endpoint es seguro de llamar cuantas veces sea: es idempotente, solo
 * acredita lo que todavia no estaba acreditado.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/engine.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

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

$before = json_encode($state, JSON_UNESCAPED_UNICODE);

byr_progress_visit($state);
$news = byr_progress_evaluate($pdo, $id, $state);

$after = json_encode($state, JSON_UNESCAPED_UNICODE);

/* Solo escribimos si algo cambio: abrir cinco pestanias no son cinco
   UPDATE. */
if ($after !== $before) {
    $upd = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
    $upd->execute([$after, $id]);
}

$pdo->commit();

json_out(array_merge(
    byr_progress_report($pdo, $id, $state),
    [
        'state'     => $state,
        'unlocked'  => $news['unlocked'],
        'completed' => $news['completed'],
    ]
));
