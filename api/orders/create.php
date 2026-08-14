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
require_once __DIR__ . '/../menu-options.php';
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
$pickupName  = trim((string) ($in['pickupName'] ?? ''));
$notes       = trim((string) ($in['notes'] ?? ''));
$phone       = trim((string) ($in['phone'] ?? '')) ?: (string) ($user['whatsapp'] ?? '');
$couponCode  = strtoupper(trim((string) ($in['couponCode'] ?? '')));

if (!$itemsIn) {
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}
if ($fulfillment === 'delivery' && $address === '') {
    json_out(['error' => 'Para delivery necesitamos tu dirección.'], 422);
}

/* Para retiro, el nombre de quien retira (si lo puso) reemplaza el de la cuenta
   como snapshot de contacto; el pedido igual queda ligado al socio por user_id. */
$customerName = ($fulfillment === 'pickup' && $pickupName !== '')
    ? (function_exists('mb_substr') ? mb_substr($pickupName, 0, 120) : substr($pickupName, 0, 120))
    : (string) $user['name'];

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
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}

$placeholders = implode(',', array_fill(0, count($keys), '?'));
$stmt = $pdo->prepare(
    "SELECT id, slug, name, price, category
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

/* --- Una línea por ítem: recomputamos precio base + opciones (server-side). --- */
$lines      = [];
$itemsTotal = 0;
foreach ($itemsIn as $it) {
    if (!is_array($it)) {
        continue;
    }
    $key = trim((string) ($it['slug'] ?? $it['id'] ?? ''));
    $qty = min((int) ($it['qty'] ?? 0), 50); // tope de cordura por línea
    if ($key === '' || $qty <= 0) {
        continue;
    }
    $p = $bySlug[$key] ?? $byId[$key] ?? null;
    if (!$p) {
        continue; // inexistente o no disponible: se descarta
    }

    /* Opciones (papas/bebida/adicionales): validadas y tarifadas por el servidor. */
    $setKey   = byr_option_set_for_category($p['category']);
    $selected = is_array($it['options'] ?? null) ? $it['options'] : [];
    $opt      = byr_resolve_options($setKey, $selected);
    if (!$opt['ok']) {
        json_out(['error' => $opt['error'], 'code' => 'option-invalid'], 422);
    }

    /* Aclaración libre del socio (ej: "sin cebolla"). No cambia el precio; se
       guarda junto al texto de opciones. Nunca se confía en su largo. */
    $note = trim((string) ($it['note'] ?? ''));
    $note = preg_replace('/\s+/u', ' ', $note);
    if (function_exists('mb_substr')) {
        $note = mb_substr($note, 0, 200);
    } else {
        $note = substr($note, 0, 200);
    }
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
        break; // tope de cordura por pedido
    }
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
        $customerName,
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
        'INSERT INTO order_items (order_id, product_id, name, options, unit_price, qty, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $ln) {
        $insItem->execute([
            $orderId,
            $ln['product_id'],
            $ln['name'],
            $ln['options'],
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
