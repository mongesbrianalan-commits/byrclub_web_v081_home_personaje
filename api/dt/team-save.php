<?php
/**
 * BYR DT — crear el equipo o cambiarle el nombre.
 * Body JSON: { name }
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$userId = require_auth();
$pdo    = db();
byr_dt_require_ready($pdo);

$in   = body_json();
$name = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($in['name'] ?? ''))));

if (mb_strlen($name) < 3) {
    json_out(['error' => 'El nombre del equipo tiene que tener al menos 3 letras.'], 422);
}
if (mb_strlen($name) > 24) {
    json_out(['error' => 'El nombre del equipo puede tener hasta 24 letras.'], 422);
}

$t = byr_dt_team_of($pdo, $userId);
if ($t) {
    $pdo->prepare('UPDATE dt_teams SET name = ?, name_reset = 0 WHERE id = ?')->execute([$name, (int) $t['id']]);
} else {
    $pdo->prepare('INSERT INTO dt_teams (user_id, name, bank) VALUES (?, ?, ?)')->execute([$userId, $name, BYR_DT_BUDGET]);
}

json_out(['ok' => true, 'team' => byr_dt_team_public(byr_dt_team_of($pdo, $userId))]);
