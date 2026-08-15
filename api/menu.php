<?php
/**
 * Menú público del club para armar el pedido (pedir.html).
 *
 * Devuelve los productos DISPONIBLES agrupados por categoría, ordenados por
 * `sort`. Los precios salen de la tabla `products`, que el admin edita desde
 * el panel. Requiere sesión (para pedir hay que estar logueado).
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/menu-options.php';

/* Público: cualquiera puede ver la carta (para pedir como invitado). */
$pdo = db();

/* Etiquetas lindas por categoría (la tabla guarda el slug de categoría). */
const BYR_MENU_CATEGORIES = [
    'promos'       => '🔥 Promos',
    'entradas'     => '🍗 Entradas',
    'hamburguesas' => '🍔 Burgers',
    'papas'        => '🍟 Papas',
    'postres'      => '🍰 Postres',
    'bebidas'      => '🥤 Bebidas',
    'combos'       => '👑 Combos',
    'otros'        => '🍴 Otros',
];

/* Los productos "solo staff" (ej: bebidas sueltas) se muestran únicamente al
   mostrador: hace falta pedir ?staff=1 Y tener sesión de cajero/admin. El menú
   público (pedir.html) nunca los ve. Resiliente si falta la columna. */
$isStaff = false;
if (isset($_GET['staff'])) {
    $uid = current_user_id();
    if ($uid) {
        $role = byr_role($pdo, $uid);
        $isStaff = ($role === 'admin' || $role === 'cajero');
    }
}
$hasStaffCol = false;
try {
    $hasStaffCol = (bool) $pdo->query("SHOW COLUMNS FROM products LIKE 'staff_only'")->fetch();
} catch (Throwable $e) {
    $hasStaffCol = false;
}

$sql = 'SELECT id, slug, category, name, description, image, emoji, price
          FROM products WHERE available = 1';
if ($hasStaffCol && !$isStaff) {
    $sql .= ' AND staff_only = 0';
}
$sql .= ' ORDER BY sort ASC, id ASC';
$rows = $pdo->query($sql)->fetchAll();

/* Agrupamos respetando el orden de BYR_MENU_CATEGORIES (categorías vacías se omiten). */
$byCat = [];
foreach ($rows as $r) {
    $cat = $r['category'];
    if (!isset($byCat[$cat])) {
        $byCat[$cat] = [];
    }
    $byCat[$cat][] = [
        'id'          => (int) $r['id'],
        'slug'        => $r['slug'],
        'name'        => $r['name'],
        'description' => $r['description'],
        'image'       => $r['image'],
        'emoji'       => $r['emoji'],
        'price'       => (int) $r['price'],
        'optionSet'   => byr_option_set_for_category($cat), // 'burger' | null
    ];
}

$categories = [];
foreach (BYR_MENU_CATEGORIES as $slug => $label) {
    if (!empty($byCat[$slug])) {
        $categories[] = [
            'slug'     => $slug,
            'label'    => $label,
            'products' => $byCat[$slug],
        ];
        unset($byCat[$slug]);
    }
}
/* Cualquier categoría rara que no esté en la lista, al final. */
foreach ($byCat as $slug => $products) {
    $categories[] = [
        'slug'     => $slug,
        'label'    => BYR_MENU_CATEGORIES['otros'],
        'products' => $products,
    ];
}

/* Tasa de puntos (1 punto cada $X) para estimar en el carrito. */
$rate = (int) byr_setting('order_points_per_amount', 100);
if ($rate < 1) {
    $rate = 100;
}

json_out([
    'categories'      => $categories,
    'pointsPerAmount' => $rate,
    /* Costo de envío, para mostrarlo en el carrito antes de crear el pedido.
       El precio que vale es igual el que recalcula el server al confirmar. */
    'deliveryFee'     => byr_shipping_ready(db()) ? byr_delivery_fee() : 0,
    /* Medios de pago que puede declarar el cliente, y a dónde transferir.
       Si no está corrida la migración, se manda vacío y el checkout no
       pregunta nada (sigue funcionando como antes). */
    'paymentPrefs'    => byr_payment_pref_ready(db()) ? byr_payment_prefs() : [],
    'transferAlias'   => (string) byr_setting('transfer_alias', 'BYRDOCKSUD.MP'),
    /* Definiciones para armar el popup. El set 'staff' (adicionales para
       cualquier producto, nada obligatorio) solo se le manda al panel. */
    'optionSets'      => $isStaff
        ? byr_option_sets()
        : array_diff_key(byr_option_sets(), ['staff' => 1]),
]);
