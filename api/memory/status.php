<?php
/**
 * Memotest diario — estado de hoy, antes de empezar a jugar.
 *   ready       → está corrida la migración del límite diario.
 *   playedToday → este usuario ya jugó hoy (lo dice la base, no el navegador).
 *
 * Sirve para no dejar jugar una partida entera y recién ahí avisar que el
 * premio no se puede acreditar.
 */
require_once __DIR__ . '/../helpers.php';
require_method('GET');

$id  = require_auth();
$pdo = db();

if (!byr_memory_daily_ready($pdo)) {
    json_out(['ready' => false, 'playedToday' => false]);
}

$stmt = $pdo->prepare('SELECT last_memory_play FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

json_out([
    'ready'       => true,
    'playedToday' => (($row['last_memory_play'] ?? null) === date('Y-m-d')),
]);
