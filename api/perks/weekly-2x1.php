<?php
/**
 * Cupón 2x1 de socio de los MIÉRCOLES.
 *   GET  -> estado del beneficio hoy: { isWednesday, claimed, code, status }
 *   POST -> activa el 2x1 de hoy (idempotente) y devuelve el código.
 *
 * El día se calcula SIEMPRE en hora de Argentina (no en la del servidor):
 * así el beneficio está disponible todo el miércoles local, incluida la
 * noche —que es cuando más se vende— sin importar el huso horario del
 * hosting (que suele estar en UTC). El código se registra en `redemptions`
 * para que el admin lo valide igual que cualquier premio y aparezca en
 * "Mis cupones".
 *
 * No necesita cambios en la base: reusa la tabla `redemptions`. El límite
 * "1 por socio por miércoles" se controla acá, guardando el created_at del
 * vale en hora de Argentina y buscando si ya hay uno dentro del día local.
 */
require_once __DIR__ . '/../helpers.php';

$id  = require_auth();
$pdo = db();

const BYR_2X1_PRIZE_ID = '2x1-wed';
const BYR_2X1_LABEL    = '2x1 Doble Cheese con papas';
const BYR_2X1_SOURCE   = 'Miércoles de socio';

$tz  = new DateTimeZone('America/Argentina/Buenos_Aires');
$now = new DateTime('now', $tz);
$isWednesday = ((int) $now->format('N') === 3); // 3 = miércoles

/* Límites del día de HOY en hora de Argentina (para la idempotencia). Como
   guardamos el created_at del vale también en hora local, comparar contra
   estos límites es correcto sin importar el huso del servidor. */
$dayStart = (clone $now)->setTime(0, 0, 0)->format('Y-m-d H:i:s');
$dayEnd   = (clone $now)->modify('+1 day')->setTime(0, 0, 0)->format('Y-m-d H:i:s');

/** Devuelve el vale 2x1 que el socio ya activó hoy (o null). */
function byr_2x1_today(PDO $pdo, int $id, string $dayStart, string $dayEnd): ?array
{
    $stmt = $pdo->prepare(
        'SELECT code, status FROM redemptions
          WHERE user_id = ? AND source = ? AND created_at >= ? AND created_at < ?
          ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([$id, BYR_2X1_SOURCE, $dayStart, $dayEnd]);
    $row = $stmt->fetch();
    return $row ?: null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $existing = byr_2x1_today($pdo, $id, $dayStart, $dayEnd);
    json_out([
        'isWednesday' => $isWednesday,
        'claimed'     => (bool) $existing,
        'code'        => $existing['code'] ?? null,
        'status'      => $existing['status'] ?? null,
    ]);
}

if ($method === 'POST') {
    if (!$isWednesday) {
        json_out(['error' => 'El 2x1 de socio es solo los miércoles.', 'code' => 'not-wednesday'], 422);
    }

    $existing = byr_2x1_today($pdo, $id, $dayStart, $dayEnd);
    if ($existing) {
        json_out(['ok' => true, 'claimed' => true, 'reused' => true, 'code' => $existing['code']]);
    }

    $code = byr_generate_redemption_code($pdo);
    $ins  = $pdo->prepare(
        'INSERT INTO redemptions (user_id, code, prize_id, prize_label, source, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, "pending", ?, DATE_ADD(?, INTERVAL ? HOUR))'
    );
    $createdAt = $now->format('Y-m-d H:i:s');
    $ins->execute([
        $id, $code, BYR_2X1_PRIZE_ID, BYR_2X1_LABEL, BYR_2X1_SOURCE,
        $createdAt, $createdAt, BYR_REDEMPTION_TTL_HOURS,
    ]);

    json_out(['ok' => true, 'claimed' => true, 'reused' => false, 'code' => $code]);
}

json_out(['error' => 'Método no permitido.'], 405);
