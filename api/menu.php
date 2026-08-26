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
require_once __DIR__ . '/perks/2x1.php';

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

/* Qué opciones abre cada producto lo elige el admin por producto. Si falta
   correr la migración, viene NULL y manda la categoría, como siempre. */
$optSel = byr_option_set_select($pdo);

$sql = "SELECT id, slug, category, name, description, image, emoji, price, $optSel
          FROM products WHERE available = 1";
if ($hasStaffCol && !$isStaff) {
    $sql .= ' AND staff_only = 0';
}
$sql .= ' ORDER BY sort ASC, id ASC';
$rows = $pdo->query($sql)->fetchAll();

/* --- 2x1 de socio de los miércoles ---------------------------------------
   Vive en `products` con available = 0, así que la consulta de arriba nunca
   lo trae. Lo agregamos a mano y sólo si corresponde: bandera encendida,
   miércoles en Argentina, socio logueado y que no lo haya usado hoy.

   Que aparezca acá es una comodidad de la carta, no un permiso:
   api/orders/create.php vuelve a comprobar todo antes de aceptarlo. */
$twoForOne = byr_2x1_web_offer($pdo, current_user_id());

if ($twoForOne['canOrder']) {
    $p2x1 = $pdo->prepare("SELECT id, slug, category, name, description, image, emoji, price, $optSel FROM products WHERE slug = ?");
    $p2x1->execute([BYR_2X1_PRODUCT_SLUG]);

    if ($row2x1 = $p2x1->fetch()) {
        /* Primero de todo: es el motivo por el que muchos van a entrar hoy. */
        array_unshift($rows, $row2x1);
    } else {
        /* Falta correr 2026-08-perk-2x1-web.sql: no ofrecemos lo que no
           existe, pero tampoco rompemos la carta. */
        $twoForOne['canOrder'] = false;
    }
}

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
        'optionSet'   => byr_option_set_for_product($r), // 'burger' | 'bebida' | null
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

    /* Estado del 2x1 de socio, para que la carta pueda destacarlo y —cuando
       no está disponible— explicar por qué en vez de callarse. */
    'perk2x1'         => array_merge($twoForOne, [
        'slug'  => BYR_2X1_PRODUCT_SLUG,
        'label' => BYR_2X1_LABEL,
    ]),

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
