<?php
/**
 * BYR DT — confirmar el plantel: los 15, los 11 titulares, el capitán y la
 * formación. Se manda siempre el equipo entero; el servidor calcula qué se
 * vendió y qué se compró.
 *
 * Body JSON: { players: [15 ids], starters: [11 ids], captain: id, formation: "4-3-3" }
 *
 * Reglas (las mismas que ve el socio): 2 ARQ, 5 DEF, 5 MED, 3 DEL; máximo 3
 * por club; no pasarse del presupuesto; 3 cambios por fecha desde la segunda
 * fecha que juega. Solo se puede tocar con la fecha abierta.
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$userId = require_auth();
$pdo    = db();
byr_dt_require_ready($pdo);
byr_dt_ensure_lock($pdo);

$round = byr_dt_current_round($pdo);
if (!$round || $round['status'] !== 'open') {
    json_out(['error' => $round
        ? 'La ' . $round['name'] . ' ya arrancó. Vas a poder hacer cambios cuando termine.'
        : 'Todavía no está abierta la próxima fecha.', 'code' => 'locked'], 409);
}

$t = byr_dt_team_of($pdo, $userId);
if (!$t) {
    json_out(['error' => 'Primero creá tu equipo.'], 422);
}
$teamId = (int) $t['id'];

$in        = body_json();
$ids       = array_values(array_unique(array_map('intval', (array) ($in['players'] ?? []))));
$starters  = array_values(array_unique(array_map('intval', (array) ($in['starters'] ?? []))));
$captain   = (int) ($in['captain'] ?? 0) ?: null;
$formation = (string) ($in['formation'] ?? '');

if (!$ids) {
    json_out(['error' => 'Tu plantel está vacío.'], 422);
}

/* Plantel actual (para saber qué se vende y qué se queda). */
$cur = $pdo->prepare('SELECT player_id, bought_price FROM dt_squads WHERE team_id = ?');
$cur->execute([$teamId]);
$current = [];
foreach ($cur->fetchAll() as $r) {
    $current[(int) $r['player_id']] = (int) $r['bought_price'];
}

/* Datos de hoy de los elegidos y de los que se van. */
$need = array_values(array_unique(array_merge($ids, array_keys($current))));
$in_  = implode(',', array_fill(0, count($need), '?'));
$st   = $pdo->prepare("SELECT id, name, position, club_id, price, active FROM dt_players WHERE id IN ($in_)");
$st->execute($need);
$info = [];
foreach ($st->fetchAll() as $r) {
    $info[(int) $r['id']] = $r;
}

$players = [];
foreach ($ids as $id) {
    if (!isset($info[$id])) {
        json_out(['error' => 'Hay un jugador que ya no está disponible. Recargá la página.'], 422);
    }
    /* Un jugador que dejó la liga se puede conservar, pero no comprar. */
    if (!(int) $info[$id]['active'] && !isset($current[$id])) {
        json_out(['error' => $info[$id]['name'] . ' ya no está en la liga.'], 422);
    }
    $players[$id] = [
        'position' => $info[$id]['position'],
        'club_id'  => (int) $info[$id]['club_id'],
        'price'    => (int) $info[$id]['price'],
    ];
}

$err = byr_dt_validate_squad($players, $starters, $captain, $formation);
if ($err) {
    json_out(['error' => $err], 422);
}

/* Plata: se vende y se compra al precio de hoy. */
$bank = (int) $t['bank'];
foreach ($current as $id => $_) {
    if (!isset($players[$id])) {
        $bank += (int) ($info[$id]['price'] ?? 0);
    }
}
foreach ($players as $id => $p) {
    if (!isset($current[$id])) {
        $bank -= $p['price'];
    }
}
if ($bank < 0) {
    json_out(['error' => 'Te pasaste del presupuesto por ' . byr_dt_money(-$bank) . '.'], 422);
}

$tr = byr_dt_transfers_used($pdo, $teamId, $ids);
if ($tr['limited'] && $tr['used'] > BYR_DT_TRANSFERS) {
    json_out(['error' => 'En esta fecha podés hacer hasta ' . BYR_DT_TRANSFERS . ' cambios (estás haciendo ' . $tr['used'] . ').'], 422);
}

$pdo->beginTransaction();
try {
    $pdo->prepare('DELETE FROM dt_squads WHERE team_id = ?')->execute([$teamId]);
    $ins = $pdo->prepare('INSERT INTO dt_squads (team_id, player_id, starter, captain, bought_price) VALUES (?, ?, ?, ?, ?)');
    foreach ($players as $id => $p) {
        $ins->execute([$teamId, $id, in_array($id, $starters, true) ? 1 : 0, $id === $captain ? 1 : 0, $current[$id] ?? $p['price']]);
    }
    $pdo->prepare('UPDATE dt_teams SET formation = ?, bank = ?, saved_at = UTC_TIMESTAMP() WHERE id = ?')
        ->execute([$formation, $bank, $teamId]);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'No se pudo guardar. Probá de nuevo.'], 500);
}

json_out([
    'ok'        => true,
    'bank'      => $bank,
    'transfers' => byr_dt_transfers_used($pdo, $teamId),
    'squad'     => byr_dt_squad($pdo, $teamId),
]);
