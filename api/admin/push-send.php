<?php
/**
 * ADMIN — Avisos push desde el panel.
 *   { action: "stats" }                          → cuántos socios/dispositivos los activaron
 *   { action: "send", title, body, url, test }   → manda a todos (o solo a vos si test = true)
 */
require_once __DIR__ . '/../push/lib.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

if (!byr_push_ready($pdo)) {
    json_out(['error' => 'Falta correr la migración 2026-11-push.sql en phpMyAdmin.', 'code' => 'not-ready'], 409);
}

$in     = body_json();
$action = (string) ($in['action'] ?? 'stats');

if ($action === 'stats') {
    $r = $pdo->query('SELECT COUNT(*) AS devices, COUNT(DISTINCT user_id) AS users FROM push_subscriptions')->fetch();
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$admin]);
    json_out([
        'ok'      => true,
        'devices' => (int) $r['devices'],
        'users'   => (int) $r['users'],
        'mine'    => (int) $stmt->fetchColumn(),
    ]);
}

if ($action !== 'send') {
    json_out(['error' => 'Acción inválida.'], 422);
}

$title = trim((string) ($in['title'] ?? ''));
$body  = trim((string) ($in['body'] ?? ''));
$url   = trim((string) ($in['url'] ?? ''));
$test  = !empty($in['test']);

if ($title === '' || $body === '') {
    json_out(['error' => 'Completá el título y el mensaje.'], 422);
}
if (mb_strlen($title) > 60 || mb_strlen($body) > 180) {
    json_out(['error' => 'El título va hasta 60 letras y el mensaje hasta 180.'], 422);
}
/* Solo páginas del propio sitio. */
if ($url === '' || !preg_match('#^/[A-Za-z0-9_\-./?=&\#]*$#', $url)) {
    $url = '/index.html';
}

$msg = ['title' => $title, 'body' => $body, 'url' => $url, 'tag' => 'news-' . time()];
$res = $test ? byr_push_to_user($pdo, $admin, $msg) : byr_push_broadcast($pdo, $msg);

json_out(['ok' => true, 'test' => $test] + $res);
