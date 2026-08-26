<?php
/**
 * Confirma un pedido pendiente: acredita los puntos al socio y, si adjuntó un
 * cupón, lo marca canjeado. Solo admin.
 *
 * Es la vía "oficial" de acreditar puntos por una compra: se resuelve del lado
 * del servidor reusando byr_grant() (el mismo helper que la carga manual).
 *
 * Body JSON: { orderId: int, points: int, paymentMethod?: string, paymentAmount?: int }
 *   points es opcional; si no viene, se usa points_suggested del pedido.
 *   paymentMethod es opcional; si viene, registra el cobro en la caja abierta
 *   (efectivo/debito/credito/qr/transfer). paymentAmount por defecto = total.
 *
 * Anti-doble-acreditación: el pedido se toma con SELECT ... FOR UPDATE y solo
 * se procesa si está 'pending'. Todo va en una transacción.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../progress/engine.php';
require_once __DIR__ . '/../caja.php';
require_once __DIR__ . '/../printing.php';
require_method('POST');

$pdo   = db();
$admin = require_role($pdo, ['cajero']);

$in      = body_json();
$orderId = (int) ($in['orderId'] ?? 0);
$hasPts  = array_key_exists('points', $in) && $in['points'] !== '' && $in['points'] !== null;
$points  = $hasPts ? (int) $in['points'] : null;
if ($orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}
if ($points !== null && $points < 0) {
    json_out(['error' => 'Los puntos no pueden ser negativos.'], 422);
}

/* Cobro (opcional): si viene un medio de pago, lo registramos en la caja. */
$payMethod = trim((string) ($in['paymentMethod'] ?? ''));
$payAmount = array_key_exists('paymentAmount', $in) && $in['paymentAmount'] !== '' && $in['paymentAmount'] !== null
    ? (int) $in['paymentAmount']
    : null;
if ($payMethod !== '' && !in_array($payMethod, byr_payment_methods(), true)) {
    json_out(['error' => 'Medio de pago inválido.'], 422);
}
if ($payAmount !== null && $payAmount < 0) {
    json_out(['error' => 'El monto cobrado no puede ser negativo.'], 422);
}

$pdo->beginTransaction();
try {
    /* Tomamos el pedido y lo bloqueamos hasta el commit. */
    $shipSel = byr_shipping_ready($pdo) ? 'shipping_cost' : '0 AS shipping_cost';
    $stmt = $pdo->prepare(
        "SELECT user_id, status, items_total, $shipSel, points_suggested, coupon_code, coupon_label
           FROM orders WHERE id = ? FOR UPDATE"
    );
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        $pdo->rollBack();
        json_out(['error' => 'No existe ese pedido.'], 404);
    }
    if ($order['status'] !== 'pending') {
        $pdo->rollBack();
        json_out([
            'error'  => 'Ese pedido ya fue ' . ($order['status'] === 'confirmed' ? 'confirmado' : 'cancelado') . '.',
            'status' => $order['status'],
        ], 409);
    }

    $basePoints = $points !== null ? $points : (int) $order['points_suggested'];
    $userId     = (int) $order['user_id'];

    /* --- Canjear el cupón adjunto (si hay) ---
       Va ANTES de acreditar a propósito: si el vale es un multiplicador
       ("2x puntos"), tiene que cambiar cuántos puntos se acreditan. Antes
       esto estaba después, así que el cupón se consumía y el socio cobraba
       lo mismo de siempre: el premio no hacía nada. */
    $couponApplied = null;  // null = no había cupón; true/false = se pudo o no
    $multiplier    = 1;

    if (!empty($order['coupon_code'])) {
        $coupon        = byr_redeem_coupon($pdo, $order['coupon_code'], $userId, $admin);
        $couponApplied = $coupon !== null;

        if ($coupon) {
            $multiplier = (int) $coupon['multiplier'];
        }
    }

    /* El multiplicador se aplica sobre lo que se iba a acreditar, sea lo
       sugerido o lo que el cajero haya escrito a mano. */
    $pointsToGrant = $basePoints * $multiplier;

    /* --- Acreditar puntos en el estado del socio --- */
    $u = $pdo->prepare('SELECT name, avatar, state FROM users WHERE id = ? FOR UPDATE');
    $u->execute([$userId]);
    $urow = $u->fetch();
    if (!$urow) {
        $pdo->rollBack();
        json_out(['error' => 'No se encontró el cliente del pedido.'], 404);
    }

    $state = !empty($urow['state'])
        ? json_decode($urow['state'], true)
        : default_state($urow['name'], $urow['avatar']);
    if (!is_array($state)) {
        $state = default_state($urow['name'], $urow['avatar']);
    }

    if ($pointsToGrant > 0) {
        /* Cuenta vieja: reconocer lo ya logrado antes de acreditar, para no
           pagarle dos veces logros que el motor del navegador ya le pagó. */
        byr_progress_seed($pdo, $userId, $state);

        byr_grant($state, $pointsToGrant, 0, 'Pedido #' . $orderId, 'order');

        /* Una compra puede destrabar un logro de puntos o de nivel. */
        byr_progress_evaluate($pdo, $userId, $state);

        $save = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
        $save->execute([json_encode($state, JSON_UNESCAPED_UNICODE), $userId]);
    }

    /* --- Marcar el pedido confirmado --- */
    $upd = $pdo->prepare(
        'UPDATE orders
            SET status = "confirmed", points_awarded = ?, confirmed_at = NOW(), confirmed_by = ?
          WHERE id = ? AND status = "pending"'
    );
    $upd->execute([$pointsToGrant, $admin, $orderId]);

    /* --- Cobro en caja (si el admin eligió un medio de pago) --- */
    /* Si la migración de caja no está corrida, se ignora el cobro y el pedido
       se confirma igual (no rompemos el flujo que ya andaba). */
    $paymentRecorded = false;
    if ($payMethod !== '' && byr_caja_ready($pdo)) {
        $sess = byr_open_session($pdo);
        if (!$sess) {
            $pdo->rollBack();
            json_out(['error' => 'Abrí la caja antes de cobrar.', 'code' => 'no-session'], 409);
        }
        /* Se cobra la comida MÁS el envío (items_total es solo la comida). */
        $amt = $payAmount !== null
            ? $payAmount
            : (int) $order['items_total'] + (int) $order['shipping_cost'];
        $payIns = $pdo->prepare(
            'INSERT INTO payments (order_id, session_id, method, amount, created_by)
             VALUES (?, ?, ?, ?, ?)'
        );
        $payIns->execute([$orderId, (int) $sess['id'], $payMethod, $amt, $admin]);
        $pdo->prepare('UPDATE orders SET paid_at = NOW(), session_id = ? WHERE id = ?')
            ->execute([(int) $sess['id'], $orderId]);
        $paymentRecorded = true;
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No se pudo confirmar el pedido. Probá de nuevo.'], 500);
}

/* --- Impresión automática (fuera de la transacción, a propósito) ---------
   Aceptar el pedido es lo que dispara la comanda a la cocina. Si la impresora
   está apagada el trabajo espera en la cola; el pedido queda confirmado igual. */
$printed = [];
foreach (byr_print_auto() as $kind) {
    if (byr_print_enqueue($pdo, $kind, $orderId, $admin)) {
        $printed[] = $kind;
    }
}

json_out([
    'ok'            => true,
    'orderId'       => $orderId,
    'printed'       => $printed,
    'pointsAwarded' => $pointsToGrant,
    'newBalance'    => (int) ($state['wallet']['points'] ?? 0),
    'couponApplied' => $couponApplied,

    /* Para que el panel pueda avisar "se duplicaron por el cupón" en vez
       de que el cajero vea un número que no cierra con lo sugerido. */
    'pointsBase'    => $basePoints,
    'multiplier'    => $multiplier,
    'paymentRecorded' => $paymentRecorded,
    'paymentMethod' => $payMethod !== '' ? $payMethod : null,
]);
