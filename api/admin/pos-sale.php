<?php
/**
 * Venta de mostrador (POS): el cajero arma un pedido en el local y lo cobra en
 * el acto. Crea la orden ya CONFIRMADA y PAGADA, registra el cobro en la caja
 * abierta y, si se identificó a un socio, le acredita los puntos. Solo admin.
 *
 * Como en create.php, los precios se RECALCULAN del lado del servidor: el
 * cliente solo manda qué producto, cantidad y qué opciones eligió.
 *
 * La venta de mostrador no es siempre "se lo lleva ahora": mucha gente viene
 * al local, pide y paga, pero quiere que se lo mandemos. Por eso el cajero
 * elige la entrega igual que el cliente en la web (`fulfillment`), y si es
 * delivery se cobra el envío y se guarda la dirección.
 *
 * Body JSON:
 *   items:         [{ slug|id, qty, options?, note? }]   (al menos 1)
 *   paymentMethod: "efectivo"|"debito"|"credito"|"qr"|"transfer"
 *   fulfillment:   "pickup" | "delivery"  (por defecto pickup: se lo lleva)
 *   address:       string (obligatorio si delivery)
 *   phone:         string (opcional; contacto para el que reparte)
 *   tendered:      int    (opcional; efectivo recibido, para el vuelto)
 *   customerEmail: string (opcional; socio a sumar puntos. Vacío = consumidor final)
 *   couponCode:    string (opcional; vale del socio. El "2x puntos" duplica lo acreditado)
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../progress/engine.php';
require_once __DIR__ . '/../menu-options.php';
require_once __DIR__ . '/../caja.php';
require_once __DIR__ . '/../printing.php';
require_method('POST');

$pdo   = db();
$admin = require_role($pdo, ['cajero']);

/* La venta de mostrador necesita las dos migraciones (caja + mostrador). */
if (!byr_caja_ready($pdo) || !byr_pos_ready($pdo)) {
    json_out(['error' => 'Falta correr las migraciones de caja y mostrador en phpMyAdmin.', 'code' => 'not-ready'], 409);
}

$session = byr_open_session($pdo);
if (!$session) {
    json_out(['error' => 'Abrí la caja antes de vender.', 'code' => 'no-session'], 409);
}

$in         = body_json();
$itemsIn    = is_array($in['items'] ?? null) ? $in['items'] : [];
$payMethod  = trim((string) ($in['paymentMethod'] ?? ''));
$tendered   = array_key_exists('tendered', $in) && $in['tendered'] !== '' && $in['tendered'] !== null
    ? (int) $in['tendered'] : null;
$custEmail  = strtolower(trim((string) ($in['customerEmail'] ?? '')));
$couponCode = strtoupper(trim((string) ($in['couponCode'] ?? '')));

/* Entrega: lo mismo que elige el cliente en la web, pero lo carga el cajero.
   Cualquier cosa que no sea "delivery" es "se lo lleva", que es el caso
   normal del mostrador y lo que venía pasando siempre. */
$fulfillment = ($in['fulfillment'] ?? 'pickup') === 'delivery' ? 'delivery' : 'pickup';
$address     = trim((string) ($in['address'] ?? ''));
$phone       = trim((string) ($in['phone'] ?? ''));

$cap = function (string $s, int $n): string {
    return function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n);
};
$address = $cap($address, 255);
$phone   = $cap($phone, 40);

if (!$itemsIn) {
    json_out(['error' => 'La venta está vacía.'], 422);
}
if (!in_array($payMethod, byr_payment_methods(), true)) {
    json_out(['error' => 'Elegí un medio de pago.'], 422);
}
if ($fulfillment === 'delivery' && $address === '') {
    json_out(['error' => 'Para el delivery hace falta la dirección.', 'code' => 'address-required'], 422);
}
if ($couponCode !== '' && $custEmail === '') {
    json_out([
        'error' => 'Para usar un cupón hay que identificar al socio primero.',
        'code'  => 'coupon-needs-customer',
    ], 422);
}

/* --- Socio (opcional): se resuelve por email server-side, nunca por id del cliente --- */
$customer = null;
if ($custEmail !== '') {
    if (!filter_var($custEmail, FILTER_VALIDATE_EMAIL)) {
        json_out(['error' => 'El email del socio no es válido.'], 422);
    }
    $c = $pdo->prepare('SELECT id, name, avatar, state FROM users WHERE email = ?');
    $c->execute([$custEmail]);
    $customer = $c->fetch();
    if (!$customer) {
        json_out(['error' => 'No hay ningún socio con ese email.', 'code' => 'customer-not-found'], 404);
    }
}

/* --- Traemos los productos reales (disponibles) para casar lo pedido --- */
$keys = [];
foreach ($itemsIn as $it) {
    if (!is_array($it)) {
        continue;
    }
    $key = trim((string) ($it['slug'] ?? $it['id'] ?? ''));
    if ($key !== '') {
        $keys[$key] = true;
    }
}
$keys = array_keys($keys);
if (!$keys) {
    json_out(['error' => 'La venta está vacía.'], 422);
}

$placeholders = implode(',', array_fill(0, count($keys), '?'));
$stmt = $pdo->prepare(
    "SELECT id, slug, name, price, category, " . byr_option_set_select($pdo) . "
       FROM products
      WHERE available = 1 AND (slug IN ($placeholders) OR id IN ($placeholders))"
);
$stmt->execute([...$keys, ...$keys]);
$products = $stmt->fetchAll();

$bySlug = [];
$byId   = [];
foreach ($products as $p) {
    $bySlug[$p['slug']]      = $p;
    $byId[(string) $p['id']] = $p;
}

/* --- Una línea por ítem: recomputamos precio base + opciones + nota (server-side) --- */
$lines      = [];
$itemsTotal = 0;
foreach ($itemsIn as $it) {
    if (!is_array($it)) {
        continue;
    }
    $key = trim((string) ($it['slug'] ?? $it['id'] ?? ''));
    $qty = min((int) ($it['qty'] ?? 0), 50);
    if ($key === '' || $qty <= 0) {
        continue;
    }
    $p = $bySlug[$key] ?? $byId[$key] ?? null;
    if (!$p) {
        continue;
    }

    $setKey   = byr_option_set_for_product($p);
    $selected = is_array($it['options'] ?? null) ? $it['options'] : [];
    $opt      = byr_resolve_options($setKey, $selected);
    if (!$opt['ok']) {
        json_out(['error' => $opt['error'], 'code' => 'option-invalid'], 422);
    }

    /* Aclaración libre (ej: "sin cebolla"): se anexa al texto de opciones. */
    $note = trim((string) ($it['note'] ?? ''));
    $note = preg_replace('/\s+/u', ' ', $note);
    $note = function_exists('mb_substr') ? mb_substr($note, 0, 200) : substr($note, 0, 200);
    $optionsText = $opt['text'];
    if ($note !== '') {
        $optionsText = ($optionsText !== '' ? $optionsText . ' · ' : '') . '📝 ' . $note;
    }

    $unit     = (int) $p['price'] + (int) $opt['delta'];
    $subtotal = $unit * $qty;
    $itemsTotal += $subtotal;
    $lines[] = [
        'product_id' => (int) $p['id'],
        'name'       => $p['name'],
        'options'    => $optionsText !== '' ? $optionsText : null,
        'unit_price' => $unit,
        'qty'        => $qty,
        'subtotal'   => $subtotal,
    ];
    if (count($lines) >= 100) {
        break;
    }
}

if (!$lines) {
    json_out(['error' => 'Los productos de la venta ya no están disponibles.'], 422);
}

/* --- Envío: se cobra igual que en la web, y se congela en el pedido -------
   Si la migración del envío no está corrida, el delivery de mostrador se
   cobra sin flete en vez de romperse (mismo criterio que create.php). */
$shippingReady = byr_shipping_ready($pdo);
$shipping      = ($fulfillment === 'delivery' && $shippingReady) ? byr_delivery_fee() : 0;
$chargeTotal   = $itemsTotal + $shipping;

/* --- Puntos (solo si hay socio): misma tasa que los pedidos online ---
   Se calculan sobre la COMIDA: el envío no suma puntos. */
$rate = (int) byr_setting('order_points_per_amount', 100);
if ($rate < 1) {
    $rate = 100;
}
$pointsSuggested = intdiv($itemsTotal, $rate);
$pointsAwarded   = $customer ? $pointsSuggested : 0;
$customerName    = $customer ? $customer['name'] : 'Consumidor final';

/* --- Insert transaccional: orden + ítems + cobro + puntos --- */
$pdo->beginTransaction();
try {
    /* --- Cupón del socio (opcional) ---
       Va acá, dentro de la transacción y ANTES de acreditar: si el vale es
       un multiplicador ("2x puntos"), cambia cuántos puntos se acreditan.
       Los vales normales (papas, bebida) vienen con multiplicador 1: se
       marcan canjeados y los puntos quedan igual.

       Hasta esta versión el mostrador no aceptaba cupones, así que el socio
       que mostraba un "2x puntos" en el local no tenía forma de usarlo. */
    $couponLabel = null;
    $multiplier  = 1;

    if ($couponCode !== '') {
        $coupon = byr_redeem_coupon($pdo, $couponCode, (int) $customer['id'], $admin);

        if (!$coupon) {
            $pdo->rollBack();
            json_out([
                'error' => 'Ese cupón no está disponible (no es de este socio, ya se usó o venció).',
                'code'  => 'coupon-invalid',
            ], 422);
        }

        $couponLabel   = $coupon['label'];
        $multiplier    = (int) $coupon['multiplier'];
        $pointsAwarded = $pointsAwarded * $multiplier;
    }

    /* La columna del envío es de una migración posterior: se suma sólo si
       está, para que la venta se guarde igual aunque falte correrla. */
    $shipCol = $shippingReady ? ', shipping_cost' : '';
    $shipVal = $shippingReady ? ', ?' : '';

    $ins = $pdo->prepare(
        "INSERT INTO orders
           (user_id, status, fulfillment, channel, customer_name, customer_phone, address,
            items_total, points_suggested, points_awarded, coupon_code, coupon_label,
            confirmed_at, confirmed_by, served_by, paid_at, session_id$shipCol)
         VALUES (?, \"confirmed\", ?, \"mostrador\", ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), ?$shipVal)"
    );
    $params = [
        $customer ? (int) $customer['id'] : null,
        $fulfillment,
        $customerName,
        $phone !== '' ? $phone : null,
        $fulfillment === 'delivery' ? $address : null,
        $itemsTotal,
        $pointsSuggested,
        $pointsAwarded,
        $couponCode !== '' ? $couponCode : null,
        $couponLabel,
        $admin,
        $admin,
        (int) $session['id'],
    ];
    if ($shippingReady) {
        $params[] = $shipping;
    }
    $ins->execute($params);
    $orderId = (int) $pdo->lastInsertId();

    $insItem = $pdo->prepare(
        'INSERT INTO order_items (order_id, product_id, name, options, unit_price, qty, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $ln) {
        $insItem->execute([
            $orderId, $ln['product_id'], $ln['name'], $ln['options'],
            $ln['unit_price'], $ln['qty'], $ln['subtotal'],
        ]);
    }

    $payIns = $pdo->prepare(
        'INSERT INTO payments (order_id, session_id, method, amount, created_by)
         VALUES (?, ?, ?, ?, ?)'
    );
    /* En la caja entra lo que realmente se cobró: la comida MÁS el envío. */
    $payIns->execute([$orderId, (int) $session['id'], $payMethod, $chargeTotal, $admin]);

    /* Puntos al socio (si hay). */
    $newBalance = null;
    if ($customer && $pointsAwarded > 0) {
        $state = !empty($customer['state'])
            ? json_decode($customer['state'], true)
            : default_state($customer['name'], $customer['avatar']);
        if (!is_array($state)) {
            $state = default_state($customer['name'], $customer['avatar']);
        }

        /* Cuenta vieja: reconocer lo ya logrado antes de acreditar, para no
           pagarle dos veces logros que el motor del navegador ya le pagó. */
        byr_progress_seed($pdo, (int) $customer['id'], $state);

        byr_grant($state, $pointsAwarded, 0, 'Pedido #' . $orderId, 'order');

        /* Una compra puede destrabar un logro de puntos o de nivel. */
        byr_progress_evaluate($pdo, (int) $customer['id'], $state);

        $save = $pdo->prepare('UPDATE users SET state = ? WHERE id = ?');
        $save->execute([json_encode($state, JSON_UNESCAPED_UNICODE), (int) $customer['id']]);
        $newBalance = (int) ($state['wallet']['points'] ?? 0);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No se pudo registrar la venta. Probá de nuevo.'], 500);
}

/* --- Impresión automática (fuera de la transacción, a propósito) ---------
   La venta ya está cobrada y guardada. Si la impresora está apagada el
   trabajo queda esperando en la cola, pero la venta NO se cae por eso. */
$printed = [];
foreach (byr_print_auto() as $kind) {
    if (byr_print_enqueue($pdo, $kind, $orderId, $admin)) {
        $printed[] = $kind;
    }
}

/* Vuelto (solo informativo, para efectivo). Se calcula sobre el total
   cobrado: con delivery, el envío también lo paga el cliente. */
$change = ($payMethod === 'efectivo' && $tendered !== null && $tendered >= $chargeTotal)
    ? $tendered - $chargeTotal
    : null;

json_out([
    'ok'      => true,
    'printed' => $printed,
    'sale'  => [
        'id'            => $orderId,
        'itemsTotal'    => $itemsTotal,
        'shippingCost'  => $shipping,
        'total'         => $chargeTotal,
        'fulfillment'   => $fulfillment,
        'address'       => $fulfillment === 'delivery' ? $address : null,
        'customerPhone' => $phone !== '' ? $phone : null,
        'items'         => $lines,
        'paymentMethod' => $payMethod,
        'tendered'      => $tendered,
        'change'        => $change,
        'customerName'  => $customerName,
        'pointsAwarded' => $pointsAwarded,
        'newBalance'    => $newBalance,

        /* Para que el ticket y el cartel de la venta puedan decir qué
           cupón se usó y si duplicó los puntos. */
        'couponCode'    => $couponCode !== '' ? $couponCode : null,
        'couponLabel'   => $couponLabel,
        'multiplier'    => $multiplier,
    ],
]);
