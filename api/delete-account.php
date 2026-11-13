<?php
/**
 * El socio borra SU PROPIA cuenta (lo exigen App Store y Google Play).
 *
 * Pide la contraseña para confirmar. Qué pasa con cada cosa:
 *   - users: se borra la fila (nombre, email, WhatsApp, cumpleaños, puntos…).
 *   - Pedidos: se CONSERVAN como registro de venta (caja, contabilidad), pero
 *     sin datos personales: user_id, nombre, teléfono, dirección y notas → NULL.
 *   - Cupones/premios (redemptions): se borran.
 *   - Prode: se borran sus pronósticos.
 *   - BYR DT: se borra su equipo, plantel, alineaciones, puntos y escudo.
 *   - A quienes invitó: se les quita el "invitado por" (no pierden nada).
 *
 * No se puede si tiene un pedido en curso, ni si es una cuenta del personal
 * (admin, cajero, cocina): esas se dan de baja desde el panel, así nadie se
 * deja el local sin administrador por accidente.
 */
require_once __DIR__ . '/helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$password = (string) (body_json()['password'] ?? '');
if ($password === '') {
    json_out(['error' => 'Escribí tu contraseña para confirmar.', 'code' => 'validation'], 422);
}

$stmt = $pdo->prepare('SELECT id, password_hash, is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$user = $stmt->fetch();
if (!$user) {
    json_out(['error' => 'No encontramos tu cuenta.', 'code' => 'not-found'], 404);
}
if (!password_verify($password, $user['password_hash'])) {
    json_out(['error' => 'La contraseña no es correcta.', 'code' => 'bad-password'], 403);
}
if ($user['is_admin'] || byr_role($pdo, $id) !== 'socio') {
    json_out(['error' => 'Las cuentas del personal del local no se pueden borrar desde acá. Pedíselo al administrador.', 'code' => 'staff'], 409);
}

/* Pedido en curso: si lo anonimizamos, la cocina pierde a quién entregarlo.
   Solo cuentan los de las últimas 24 h: hay pedidos viejos que quedaron en
   "confirmed" para siempre (antes de existir los estados de seguimiento). */
try {
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM orders
          WHERE user_id = ? AND status IN ('pending','confirmed','preparing','on_the_way')
            AND created_at > (NOW() - INTERVAL 1 DAY)"
    );
    $stmt->execute([$id]);
    if ((int) $stmt->fetchColumn() > 0) {
        json_out(['error' => 'Tenés un pedido en curso. Cuando lo recibas vas a poder borrar tu cuenta.', 'code' => 'pending-order'], 409);
    }
} catch (Throwable $e) {
    /* sin tabla de pedidos: no hay nada que esperar */
}

/** Corre una consulta tolerando que la tabla no exista (migración sin correr). */
function byr_del_try(PDO $pdo, string $sql, array $params): void
{
    try {
        $pdo->prepare($sql)->execute($params);
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') { // 42S02 = la tabla no existe
            throw $e;
        }
    }
}

$crest = null;

try {
    $pdo->beginTransaction();

    // Pedidos: quedan como venta, sin nada que identifique al socio.
    byr_del_try($pdo,
        'UPDATE orders SET user_id = NULL, customer_name = NULL, customer_phone = NULL, address = NULL, notes = NULL
          WHERE user_id = ?', [$id]);

    byr_del_try($pdo, 'DELETE FROM redemptions WHERE user_id = ?', [$id]);
    byr_del_try($pdo, 'DELETE FROM prode_predictions WHERE user_id = ?', [$id]);

    // BYR DT: equipo y todo lo que cuelga de él.
    try {
        $stmt = $pdo->prepare('SELECT id, crest FROM dt_teams WHERE user_id = ?');
        $stmt->execute([$id]);
        $team = $stmt->fetch();
    } catch (PDOException $e) {
        $team = false;
    }
    if ($team) {
        $tid   = (int) $team['id'];
        $crest = $team['crest'];
        byr_del_try($pdo, 'DELETE FROM dt_squads WHERE team_id = ?', [$tid]);
        byr_del_try($pdo, 'DELETE FROM dt_lineups WHERE team_id = ?', [$tid]);
        byr_del_try($pdo, 'DELETE FROM dt_team_rounds WHERE team_id = ?', [$tid]);
        byr_del_try($pdo, 'DELETE FROM dt_teams WHERE id = ?', [$tid]);
    }

    $pdo->prepare('UPDATE users SET referred_by = NULL WHERE referred_by = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No pudimos borrar tu cuenta. Probá de nuevo o escribinos por WhatsApp.', 'code' => 'server'], 500);
}

// El escudo subido del equipo de BYR DT (archivo), recién después de confirmar.
if ($crest && strpos($crest, 'uploads/dt/') === 0) {
    @unlink(dirname(__DIR__) . '/' . $crest);
}

// Cerrar la sesión.
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

json_out(['ok' => true]);
