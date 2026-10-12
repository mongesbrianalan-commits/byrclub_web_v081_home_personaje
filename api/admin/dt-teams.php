<?php
/**
 * ADMIN — BYR DT: equipos de los socios (para moderar nombres y escudos) y
 * marcar el premio de una fecha como entregado.
 *
 * GET  ?q=texto                          → últimos cambios primero
 * POST { action: "remove_crest", teamId }
 * POST { action: "reset_name",   teamId } → queda "Equipo de [DT]" y se le pide otro
 * POST { action: "delivered",    roundId }
 */
require_once __DIR__ . '/../dt/lib.php';

$pdo = db();
require_admin($pdo);
byr_dt_require_ready($pdo);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $q = trim((string) ($_GET['q'] ?? ''));
    $sql = 'SELECT t.id, t.name, t.crest, t.updated_at, t.created_at, u.name AS user_name,
                   (SELECT COUNT(*) FROM dt_squads s WHERE s.team_id = t.id) AS players
              FROM dt_teams t JOIN users u ON u.id = t.user_id';
    $args = [];
    if ($q !== '') {
        $sql .= ' WHERE t.name LIKE ? OR u.name LIKE ?';
        $args = ['%' . $q . '%', '%' . $q . '%'];
    }
    $sql .= ' ORDER BY t.updated_at DESC LIMIT 30';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    json_out(['ok' => true, 'teams' => array_map(fn($t) => [
        'id'       => (int) $t['id'],
        'name'     => $t['name'],
        'initials' => byr_dt_initials($t['name']),
        'crest'    => byr_dt_crest_url($t['crest']),
        'dt'       => byr_dt_dt_name((string) $t['user_name']),
        'players'  => (int) $t['players'],
        'updated'  => byr_dt_when($t['updated_at']),
    ], $st->fetchAll())]);
}

require_method('POST');
$in = body_json();
$action = (string) ($in['action'] ?? '');

if ($action === 'delivered') {
    $pdo->prepare('UPDATE dt_rounds SET prize_delivered = 1 WHERE id = ?')->execute([(int) ($in['roundId'] ?? 0)]);
    json_out(['ok' => true]);
}

$teamId = (int) ($in['teamId'] ?? 0);
$st = $pdo->prepare('SELECT t.*, u.name AS user_name FROM dt_teams t JOIN users u ON u.id = t.user_id WHERE t.id = ?');
$st->execute([$teamId]);
$t = $st->fetch();
if (!$t) {
    json_out(['error' => 'No existe ese equipo.'], 404);
}

if ($action === 'remove_crest') {
    if ($t['crest'] && strpos($t['crest'], 'uploads/dt/') === 0) {
        @unlink(dirname(__DIR__, 2) . '/' . $t['crest']);
    }
    $pdo->prepare('UPDATE dt_teams SET crest = NULL WHERE id = ?')->execute([$teamId]);
    json_out(['ok' => true]);
}

if ($action === 'reset_name') {
    $first = preg_split('/\s+/', trim((string) $t['user_name']))[0] ?: 'Socio';
    $name  = mb_substr('Equipo de ' . $first, 0, 24);
    $pdo->prepare('UPDATE dt_teams SET name = ?, name_reset = 1 WHERE id = ?')->execute([$name, $teamId]);
    json_out(['ok' => true, 'name' => $name]);
}

json_out(['error' => 'Acción desconocida.'], 422);
