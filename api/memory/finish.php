<?php
/**
 * Memotest diario — cierre de la partida, resuelto del lado del servidor.
 *   - Controla que sea 1 partida por día (server-authoritative), igual que
 *     la ruleta. Antes esto vivía solo en localStorage y se salteaba
 *     borrando los datos del navegador o entrando desde otro celular.
 *   - Calcula el premio ACÁ a partir de los intentos. El cliente no elige
 *     cuántos puntos se lleva.
 *   - Acredita puntos/XP y devuelve el estado actualizado.
 *
 * El Memotest no reparte vales canjeables: solo puntos y XP.
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

if (!byr_memory_daily_ready($pdo)) {
    json_out([
        'error' => 'El Memotest todavía no está habilitado. (Falta correr 2026-08-memory-daily.sql.)',
        'code'  => 'memory-not-ready',
    ], 503);
}

/* Parejas del tablero. Tiene que coincidir con CARD_ICONS de memory.js:
   con 8 parejas, la partida perfecta son 8 intentos. */
const BYR_MEMORY_PAIRS = 8;

$in      = body_json();
$moves   = (int) ($in['moves'] ?? 0);
$seconds = (int) ($in['seconds'] ?? 0);

/* Nadie puede completar el tablero en menos intentos que parejas hay, así
   que un número menor es basura (o alguien probando). Lo acotamos en vez de
   fallar: el premio máximo ya está topeado por la tabla de abajo. */
$moves   = max(BYR_MEMORY_PAIRS, min($moves, 500));
$seconds = max(0, min($seconds, 86400));

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) {
    json_out(['error' => 'Usuario no encontrado.'], 404);
}

$today = date('Y-m-d');
if (($row['last_memory_play'] ?? null) === $today) {
    json_out(['error' => 'Ya jugaste hoy. Volvé mañana.', 'code' => 'already-played'], 409);
}

/* Premio: base por completar + bonus por eficiencia (menos intentos, mejor).
   Máximo posible: 120 puntos y 70 XP. */
$points = 60;
$xp     = 40;
$tier   = '¡Tablero completado!';
$kicker = '¡Completaste el Memotest!';

if ($moves <= BYR_MEMORY_PAIRS + 2) {
    $points += 60;
    $xp     += 30;
    $tier    = '¡Memoria de campeón!';
    $kicker  = '¡Casi perfecto!';
} elseif ($moves <= BYR_MEMORY_PAIRS * 2) {
    $points += 30;
    $xp     += 15;
    $tier    = '¡Muy buena memoria!';
    $kicker  = '¡Gran partida!';
}

$state = !empty($row['state'])
    ? json_decode($row['state'], true)
    : default_state($row['name'], $row['avatar']);
if (!is_array($state)) {
    $state = default_state($row['name'], $row['avatar']);
}

byr_grant($state, $points, $xp, 'Memotest BYR: ' . $moves . ' intentos', 'memory');

/* Estado + marca del día en un solo UPDATE (así el límite diario no se
   puede colar entre dos peticiones simultáneas). */
$upd = $pdo->prepare('UPDATE users SET state = ?, last_memory_play = ? WHERE id = ?');
$upd->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $today, $id]);

json_out([
    'reward' => [
        'points'  => $points,
        'xp'      => $xp,
        'tier'    => $tier,
        'kicker'  => $kicker,
        'moves'   => $moves,
        'seconds' => $seconds,
    ],
    'state' => $state,
]);
