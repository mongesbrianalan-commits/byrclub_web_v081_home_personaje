<?php
/**
 * Crea un pedido del socio (queda 'pending' hasta que el admin lo confirme).
 *
 * Clave de seguridad: los precios se RECALCULAN del lado del servidor leyendo
 * la tabla `products`. El cliente solo manda qué producto y cuánta cantidad;
 * nunca se confía en el precio que venga del navegador.
 *
 * Body JSON:
 *   items:       [{ slug|id, qty }]        (al menos 1)
 *   fulfillment: "pickup" | "delivery"
 *   address:     string  (obligatorio si delivery)
 *   phone:       string  (opcional; si no, se usa el WhatsApp de la cuenta)
 *   notes:       string  (opcional)
 *   couponCode:  string  (opcional; un cupón propio disponible para adjuntar)
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

/* Datos de la cuenta para el snapshot de contacto. */
$stmt = $pdo->prepare('SELECT name, whatsapp FROM users WHERE id = ?');
$stmt->execute([$id]);
$user = $stmt->fetch();
if (!$user) {
    json_out(['error' => 'No se encontró tu cuenta.'], 404);
}

$in          = body_json();
$itemsIn     = is_array($in['items'] ?? null) ? $in['items'] : [];
$fulfillment = ($in['fulfillment'] ?? 'pickup') === 'delivery' ? 'delivery' : 'pickup';
$address     = trim((string) ($in['address'] ?? ''));
$notes       = trim((string) ($in['notes'] ?? ''));
$phone       = trim((string) ($in['phone'] ?? '')) ?: (string) ($user['whatsapp'] ?? '');
$couponCode  = strtoupper(trim((string) ($in['couponCode'] ?? '')));

if (!$itemsIn) {
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}
if ($fulfillment === 'delivery' && $address === '') {
    json_out(['error' => 'Para delivery necesitamos tu dirección.'], 422);
}

/* --- Normalizamos ítems: sumamos cantidades por slug/id, ignoramos basura --- */
$wanted = [];   // key => qty
foreach ($itemsIn as $it) {
    if (!is_array($it)) {
        continue;
    }
    $key = trim((string) ($it['slug'] ?? $it['id'] ?? ''));
    $qty = (int) ($it['qty'] ?? 0);
    if ($key === '' || $qty <= 0) {
        continue;
    }
    $qty = min($qty, 50); // tope de cordura por ítem
    $wanted[$key] = ($wanted[$key] ?? 0) + $qty;
}
if (!$wanted) {
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}

/* --- Traemos los productos reales (disponibles) y recomputamos precios --- */
$keys         = array_keys($wanted);
$placeholders = implode(',', array_fill(0, count($keys), '?'));
$stmt = $pdo->prepare(
    "SELECT id, slug, name, price
       FROM products
      WHERE available = 1 AND (slug IN ($placeholders) OR id IN ($placeholders))"
);
$stmt->execute([...$keys, ...$keys]);
$products = $stmt->fetchAll();

/* Índice por slug y por id para casar contra lo pedido. */
$bySlug = [];
$byId   = [];
foreach ($products as $p) {
    $bySlug[$p['slug']]       = $p;
    $byId[(string) $p['id']]  = $p;
}

$lines      = [];
$itemsTotal = 0;
foreach ($wanted as $key => $qty) {
    $p = $bySlug[$key] ?? $byId[$key] ?? null;
    if (!$p) {
        continue; // producto inexistente o no disponible: se descarta
    }
    $unit     = (int) $p['price'];
    $subtotal = $unit * $qty;
    $itemsTotal += $subtotal;
    $lines[] = [
        'product_id' => (int) $p['id'],
        'name'       => $p['name'],
        'unit_price' => $unit,
        'qty'        => $qty,
        'subtotal'   => $subtotal,
    ];
}

if (!$lines) {
    json_out(['error' => 'Los productos de tu pedido ya no están disponibles.'], 422);
}

/* --- Cupón adjunto (opcional): debe ser del socio, pendiente y no vencido --- */
$couponLabel = null;
if ($couponCode !== '') {
    $c = $pdo->prepare(
        'SELECT prize_label
           FROM redemptions
          WHERE code = ? AND user_id = ? AND status = "pending"
            AND (expires_at IS NULL OR expires_at > NOW())'
    );
    $c->execute([$couponCode, $id]);
    $coupon = $c->fetch();
    if (!$coupon) {
        json_out([
            'error' => 'Ese cupón no está disponible (no es tuyo, ya se usó o venció).',
            'code'  => 'coupon-invalid',
        ], 422);
    }
    $couponLabel = $coupon['prize_label'];
}

/* --- Puntos sugeridos por la tasa configurable (1 punto cada $X) --- */
$rate           = (int) byr_setting('order_points_per_amount', 100);
if ($rate < 1) {
    $rate = 100;
}
$pointsSuggested = intdiv($itemsTotal, $rate);

/* --- Insert transaccional: orden + ítems --- */
$pdo->beginTransaction();
try {
    $ins = $pdo->prepare(
        'INSERT INTO orders
           (user_id, status, fulfillment, customer_name, customer_phone, address, notes,
            items_total, points_suggested, coupon_code, coupon_label)
         VALUES (?, "pending", ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([
        $id,
        $fulfillment,
        $user['name'],
        $phone !== '' ? $phone : null,
        $fulfillment === 'delivery' ? $address : null,
        $notes !== '' ? $notes : null,
        $itemsTotal,
        $pointsSuggested,
        $couponCode !== '' ? $couponCode : null,
        $couponLabel,
    ]);
    $orderId = (int) $pdo->lastInsertId();

    $insItem = $pdo->prepare(
        'INSERT INTO order_items (order_id, product_id, name, unit_price, qty, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $ln) {
        $insItem->execute([
            $orderId,
            $ln['product_id'],
            $ln['name'],
            $ln['unit_price'],
            $ln['qty'],
            $ln['subtotal'],
        ]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'No pudimos registrar tu pedido. Probá de nuevo.'], 500);
}

json_out([
    'ok'    => true,
    'order' => [
        'id'          => $orderId,
        'status'      => 'pending',
        'fulfillment' => $fulfillment,
        'itemsTotal'  => $itemsTotal,
        'items'       => $lines,
        'couponCode'  => $couponCode !== '' ? $couponCode : null,
        'couponLabel' => $couponLabel,
    ],
]);
