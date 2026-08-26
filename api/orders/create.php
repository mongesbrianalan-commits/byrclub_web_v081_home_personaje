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
require_once __DIR__ . '/../perks/2x1.php';
require_method('POST');

$pdo = db();
$id  = current_user_id(); // null = invitado (pide sin loguearse)

/* Guardamos quién es el SOCIO antes de que $id se reasigne a la cuenta
   exprés del invitado más abajo. El 2x1 es un beneficio de socio: un
   invitado no lo puede pedir aunque le creemos una cuenta por teléfono. */
$memberId = $id;

$in          = body_json();
$itemsIn     = is_array($in['items'] ?? null) ? $in['items'] : [];
$fulfillment = ($in['fulfillment'] ?? 'pickup') === 'delivery' ? 'delivery' : 'pickup';
$address     = trim((string) ($in['address'] ?? ''));
$pickupName  = trim((string) ($in['pickupName'] ?? ''));
$guestName   = trim((string) ($in['name'] ?? ''));
$notes       = trim((string) ($in['notes'] ?? ''));
$phone        = trim((string) ($in['phone'] ?? ''));
$couponCode   = strtoupper(trim((string) ($in['couponCode'] ?? '')));
$paymentPref  = trim((string) ($in['paymentPref'] ?? ''));
$cashHint     = array_key_exists('cashHint', $in) && $in['cashHint'] !== '' && $in['cashHint'] !== null
    ? (int) $in['cashHint'] : null;

if ($paymentPref !== '' && !in_array($paymentPref, byr_payment_prefs(), true)) {
    json_out(['error' => 'Elegí cómo vas a pagar.'], 422);
}
/* El "¿con cuánto pagás?" solo tiene sentido en efectivo. */
if ($paymentPref !== 'efectivo') {
    $cashHint = null;
}
if ($cashHint !== null && ($cashHint < 0 || $cashHint > 10000000)) {
    $cashHint = null;
}

if (!$itemsIn) {
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}
if ($fulfillment === 'delivery' && $address === '') {
    json_out(['error' => 'Para delivery necesitamos tu dirección.'], 422);
}

$cap120 = function (string $s): string {
    return function_exists('mb_substr') ? mb_substr($s, 0, 120) : substr($s, 0, 120);
};

if ($id) {
    /* --- Socio logueado: snapshot de contacto desde la cuenta --- */
    $stmt = $pdo->prepare('SELECT name, whatsapp FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) {
        json_out(['error' => 'No se encontró tu cuenta.'], 404);
    }
    if ($phone === '') {
        $phone = (string) ($user['whatsapp'] ?? '');
    }
    // El campo "Tu nombre" (prellenado con el de la cuenta) queda como snapshot.
    $nameField    = $guestName !== '' ? $guestName : $pickupName;
    $customerName = $nameField !== '' ? $cap120($nameField) : (string) $user['name'];
} else {
    /* --- Invitado: cuenta exprés por teléfono. Nombre y WhatsApp obligatorios. --- */
    $name = $pickupName !== '' ? $pickupName : $guestName;
    if ($name === '') {
        json_out(['error' => 'Necesitamos tu nombre.'], 422);
    }
    if ($phone === '') {
        json_out(['error' => 'Necesitamos tu WhatsApp para avisarte del pedido.'], 422);
    }
    $couponCode   = ''; // los invitados no adjuntan cupones
    $id           = byr_find_or_create_phone_account($pdo, $name, $phone);
    $customerName = $cap120($name);
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
    json_out(['error' => 'Tu pedido está vacío.'], 422);
}

/* --- 2x1 de socio: ¿lo está pidiendo, y puede? --------------------------
   El producto vive con available = 0, así que la consulta de abajo lo trae
   sólo por el OR explícito. Que aparezca en la carta no alcanza: acá se
   vuelve a comprobar TODO (bandera, miércoles, socio, que no lo haya usado),
   porque la carta es una comodidad y esto es la puerta. */
$wants2x1  = in_array(BYR_2X1_PRODUCT_SLUG, $keys, true);
$offer2x1  = byr_2x1_web_offer($pdo, $memberId);

if ($wants2x1) {
    if ($memberId === null) {
        json_out([
            'error' => 'El 2x1 de socio es para socios: entrá con tu cuenta para pedirlo.',
            'code'  => 'perk-2x1-needs-member',
        ], 422);
    }
    if (!$offer2x1['enabled']) {
        json_out([
            'error' => 'El 2x1 por la web todavía no está disponible.',
            'code'  => 'perk-2x1-off',
        ], 422);
    }
    if (!$offer2x1['isWednesday']) {
        json_out([
            'error' => 'El 2x1 de socio es solo los miércoles.',
            'code'  => 'not-wednesday',
        ], 422);
    }
    if ($offer2x1['used']) {
        json_out([
            'error' => 'Ya usaste tu 2x1 de este miércoles.',
            'code'  => 'perk-2x1-used',
        ], 409);
    }
}

$placeholders = implode(',', array_fill(0, count($keys), '?'));
$stmt = $pdo->prepare(
    "SELECT id, slug, name, price, category, " . byr_option_set_select($pdo) . "
       FROM products
      WHERE (available = 1 OR slug = ?) AND (slug IN ($placeholders) OR id IN ($placeholders))"
);
$stmt->execute([BYR_2X1_PRODUCT_SLUG, ...$keys, ...$keys]);
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

    /* El 2x1 es uno por socio por miércoles: pedir tres no da tres. */
    if ($p['slug'] === BYR_2X1_PRODUCT_SLUG) {
        $qty = 1;
    }

    /* Opciones (papas/bebida/adicionales): validadas y tarifadas por el servidor. */
    $setKey   = byr_option_set_for_product($p);
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
        'slug'       => $p['slug'],   /* interno: para reconocer el 2x1 */
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
        'SELECT prize_id, prize_label
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

    /* El 2x1 de socio NO se adjunta a un pedido web.
       El código es un vale para mostrar en el local; por la web el 2x1 entra
       como PRODUCTO, que es lo único que cobra el precio correcto. Si se
       pudiera adjuntar, el cupón se consumiría y el pedido saldría igual que
       siempre — la misma trampa que tenía el "2x puntos" antes de arreglarlo,
       con el agravante de que acá el socio pierde su beneficio de la semana. */
    if (in_array($coupon['prize_id'], [BYR_2X1_PRIZE_ID, BYR_2X1_PRIZE_ID_WEB], true)) {
        json_out([
            'error' => 'El 2x1 de socio no se adjunta al pedido: mostrá el código en el local, o pedilo desde la carta cuando esté disponible.',
            'code'  => 'coupon-not-for-web',
        ], 422);
    }

    $couponLabel = $coupon['prize_label'];
}

/* --- Envío: fijo para delivery, gratis para retiro ---------------------
   Se congela en el pedido (columna shipping_cost) para que un cambio de
   precio futuro no reescriba lo que este cliente pagó. */
$shippingReady = byr_shipping_ready($pdo);
$shipping      = ($fulfillment === 'delivery' && $shippingReady) ? byr_delivery_fee() : 0;
$paymentReady  = byr_payment_pref_ready($pdo);

/* --- Puntos sugeridos por la tasa configurable (1 punto cada $X) ---
   Se calculan sobre la COMIDA: el envío no suma puntos. */
$rate           = (int) byr_setting('order_points_per_amount', 100);
if ($rate < 1) {
    $rate = 100;
}
$pointsSuggested = intdiv($itemsTotal, $rate);

/* --- Insert transaccional: orden + ítems --- */
$pdo->beginTransaction();
try {
    /* Las columnas de migraciones posteriores (envío, medio de pago) se suman
       solo si están: así el pedido se guarda igual aunque falte correr una. */
    $params = [
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
    ];
    $extraCols = '';
    if ($shippingReady) {
        $extraCols .= ', shipping_cost';
        $params[] = $shipping;
    }
    if ($paymentReady) {
        $extraCols .= ', payment_pref, cash_hint';
        $params[] = $paymentPref !== '' ? $paymentPref : null;
        $params[] = $cashHint;
    }
    $extraVals = str_repeat(', ?', substr_count($extraCols, ','));

    $ins = $pdo->prepare(
        "INSERT INTO orders
           (user_id, status, fulfillment, customer_name, customer_phone, address, notes,
            items_total, points_suggested, coupon_code, coupon_label$extraCols)
         VALUES (?, \"pending\", ?, ?, ?, ?, ?, ?, ?, ?, ?$extraVals)"
    );
    $ins->execute($params);
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

    /* --- 2x1 de socio: queda consumido por este pedido ---
       Se marca acá y no al confirmar, para que no se puedan dejar tres
       pedidos pendientes cada uno con su 2x1. Si el local cancela el
       pedido, orders-cancel.php se lo devuelve. */
    $used2x1 = false;
    foreach ($lines as $ln) {
        if (($ln['slug'] ?? null) === BYR_2X1_PRODUCT_SLUG) {
            $used2x1 = true;
            break;
        }
    }
    if ($used2x1 && $memberId !== null) {
        byr_2x1_consume_for_order($pdo, $memberId, $orderId);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'No pudimos registrar tu pedido. Probá de nuevo.'], 500);
}

json_out([
    'ok'    => true,
    'order' => [
        'id'           => $orderId,
        'status'       => 'pending',
        'fulfillment'  => $fulfillment,
        'itemsTotal'   => $itemsTotal,
        'shippingCost' => $shipping,
        'total'        => $itemsTotal + $shipping,
        'paymentPref'  => $paymentReady && $paymentPref !== '' ? $paymentPref : null,
        'cashHint'     => $paymentReady ? $cashHint : null,
        'items'        => $lines,
        'couponCode'   => $couponCode !== '' ? $couponCode : null,
        'couponLabel'  => $couponLabel,
    ],
]);
