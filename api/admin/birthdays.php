<?php
/**
 * Lista de socios que cumplen años en un mes dado. Solo admin.
 * GET ?month=1..12 (por defecto, el mes actual).
 * Sirve para que el admin sepa a quién le toca el regalo de cumpleaños.
 */
require_once __DIR__ . '/../helpers.php';

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

$month = (int) ($_GET['month'] ?? date('n'));
if ($month < 1 || $month > 12) {
    $month = (int) date('n');
}

$stmt = $pdo->prepare(
    'SELECT name, whatsapp, email, avatar, DAY(birthdate) AS day
       FROM users
      WHERE birthdate IS NOT NULL AND MONTH(birthdate) = ?
      ORDER BY DAY(birthdate) ASC, name ASC'
);
$stmt->execute([$month]);
$rows = $stmt->fetchAll();

json_out([
    'month'     => $month,
    'count'     => count($rows),
    'birthdays' => array_map(static function ($r) {
        return [
            'name'     => $r['name'],
            'whatsapp' => $r['whatsapp'],
            'email'    => $r['email'],
            'avatar'   => $r['avatar'],
            'day'      => (int) $r['day'],
        ];
    }, $rows),
]);
