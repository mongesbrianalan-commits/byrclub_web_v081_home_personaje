<?php
/**
 * ADMIN — Marca (o desmarca) una fecha del Prode como "de cruces" (octavos,
 * cuartos…). En una fecha de cruces, cada socio además del resultado elige
 * quién pasa de fase, y acertarlo suma +5.
 *
 * Body: { roundId, knockout: true|false }
 */
require_once __DIR__ . '/../prode/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

if (!byr_prode_cruces_ready($pdo)) {
    json_out(['error' => 'Falta correr la migración 2026-11-prode-cruces.sql en phpMyAdmin.'], 409);
}

$in       = body_json();
$roundId  = (int) ($in['roundId'] ?? 0);
$knockout = !empty($in['knockout']) ? 1 : 0;

if ($roundId <= 0) {
    json_out(['error' => 'Falta el ID de la fecha.'], 422);
}

$stmt = $pdo->prepare('SELECT name FROM prode_rounds WHERE id = ?');
$stmt->execute([$roundId]);
$name = $stmt->fetchColumn();
if ($name === false) {
    json_out(['error' => 'Esa fecha no existe.'], 404);
}

$pdo->prepare('UPDATE prode_rounds SET knockout = ? WHERE id = ?')->execute([$knockout, $roundId]);

json_out(['ok' => true, 'roundId' => $roundId, 'round' => $name, 'knockout' => (bool) $knockout]);
