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

require_auth();
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

$stmt = $pdo->query(
    'SELECT id, slug, category, name, description, image, emoji, price
       FROM products
      WHERE available = 1
      ORDER BY sort ASC, id ASC'
);
$rows = $stmt->fetchAll();

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
    'optionSets'      => byr_option_sets(), // definiciones para armar el popup
]);
