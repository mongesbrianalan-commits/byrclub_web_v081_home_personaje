<?php
/**
 * ADMIN — Lista los nombres de equipos guardados (prode_teams), para el
 * autocompletado del formulario de carga de partidos. Así se escribe el
 * nombre exacto y el escudo matchea seguro.
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

try {
    $names = $pdo->query('SELECT name FROM prode_teams ORDER BY name ASC')->fetchAll(PDO::FETCH_COLUMN);
} catch (PDOException $e) {
    $names = []; // si todavía no está la tabla, devolvemos vacío sin romper
}

json_out(['teams' => $names]);
