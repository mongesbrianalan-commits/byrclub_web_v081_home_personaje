<?php
/**
 * Asigna un rol a un usuario (socio | cajero | cocina | admin). Solo admin.
 *
 * is_admin se mantiene en sincronía: role='admin' => is_admin=1, cualquier otro
 * => is_admin=0. No podés cambiar tu propio rol (evita auto-bloqueo).
 *
 * Body JSON: { email: string, role: "socio"|"cajero"|"cocina"|"admin" }
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$pdo   = db();
$admin = require_admin($pdo);

$in    = body_json();
$email = strtolower(trim((string) ($in['email'] ?? '')));
$role  = trim((string) ($in['role'] ?? ''));

$allowed = ['socio', 'cajero', 'cocina', 'admin'];
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['error' => 'Email inválido.'], 422);
}
if (!in_array($role, $allowed, true)) {
    json_out(['error' => 'Rol inválido.'], 422);
}

$stmt = $pdo->prepare('SELECT id, name FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();
if (!$user) {
    json_out(['error' => 'No hay ningún usuario con ese email.', 'code' => 'not-found'], 404);
}
if ((int) $user['id'] === $admin) {
    json_out(['error' => 'No podés cambiar tu propio rol.', 'code' => 'self'], 409);
}

$isAdmin = $role === 'admin' ? 1 : 0;
try {
    $upd = $pdo->prepare('UPDATE users SET role = ?, is_admin = ? WHERE id = ?');
    $upd->execute([$role, $isAdmin, (int) $user['id']]);
} catch (Throwable $e) {
    json_out(['error' => 'Falta correr la migración de roles (2026-08-roles.sql) en phpMyAdmin.', 'code' => 'not-ready'], 409);
}

json_out(['ok' => true, 'name' => $user['name'], 'role' => $role]);
