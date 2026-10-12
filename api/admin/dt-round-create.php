<?php
/**
 * ADMIN — BYR DT: abrir una fecha nueva a partir de una fecha de la API
 * ("Clausura - 13"). Trae sus partidos; el cierre para armar el equipo es
 * el arranque del primer partido. Solo puede haber una fecha sin cerrar.
 *
 * Body JSON: { apiRound: "Clausura - 13" }
 */
require_once __DIR__ . '/../dt/lib.php';
require_method('POST');

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);

$apiRound = trim((string) (body_json()['apiRound'] ?? ''));
if ($apiRound === '') {
    json_out(['error' => 'Elegí la fecha.'], 422);
}
if (byr_dt_current_round($pdo)) {
    json_out(['error' => 'Todavía hay una fecha sin cerrar. Cerrala antes de abrir la próxima.'], 409);
}
$players = (int) $pdo->query('SELECT COUNT(*) FROM dt_players WHERE active = 1 AND price > 0')->fetchColumn();
if ($players < 300) {
    json_out(['error' => 'Primero cargá los jugadores (botón "Actualizar jugadores y precios").'], 409);
}

try {
    $fx = byr_apifootball_get('fixtures', ['league' => byr_prode_league(), 'season' => byr_prode_season(), 'round' => $apiRound]);
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 502);
}

$kick = [];
foreach ($fx as $f) {
    if (!in_array($f['fixture']['status']['short'] ?? '', BYR_DT_VOID_STATUS, true)) {
        $kick[] = gmdate('Y-m-d H:i:s', strtotime($f['fixture']['date']));
    }
}
if (!$kick) {
    json_out(['error' => 'La API no tiene partidos para esa fecha.'], 422);
}
sort($kick);
if ($kick[0] <= byr_dt_now()) {
    json_out(['error' => 'Esa fecha ya arrancó: no da tiempo a armar los equipos.'], 422);
}

$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO dt_rounds (api_round, name, season, deadline) VALUES (?, ?, ?, ?)')
        ->execute([$apiRound, byr_dt_round_label($apiRound), byr_prode_season(), $kick[0]]);
    $roundId = (int) $pdo->lastInsertId();
    $ins = $pdo->prepare(
        'INSERT INTO dt_fixtures (id, round_id, home_id, away_id, home_name, away_name, kickoff, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE round_id = VALUES(round_id), kickoff = VALUES(kickoff), status = VALUES(status)'
    );
    foreach ($fx as $f) {
        $ins->execute([
            (int) $f['fixture']['id'], $roundId,
            (int) $f['teams']['home']['id'], (int) $f['teams']['away']['id'],
            $f['teams']['home']['name'], $f['teams']['away']['name'],
            gmdate('Y-m-d H:i:s', strtotime($f['fixture']['date'])), $f['fixture']['status']['short'] ?? 'NS',
        ]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'No se pudo abrir la fecha: ' . $e->getMessage()], 500);
}

json_out(['ok' => true, 'name' => byr_dt_round_label($apiRound), 'deadline' => byr_dt_when($kick[0])]);
