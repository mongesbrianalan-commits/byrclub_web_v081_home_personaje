<?php
/**
 * Lista TODOS los productos del menú (incluidos los no disponibles) para el
 * editor del panel admin. Solo admin.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-options.php';
require_once __DIR__ . '/../menu-categories.php';

$pdo = db();
require_admin($pdo);

$stmt = $pdo->query(
    'SELECT id, slug, category, name, description, image, emoji, price, available, sort, ' . byr_option_set_select($pdo) . '
       FROM products
      ORDER BY sort ASC, id ASC'
);

$products = [];
foreach ($stmt->fetchAll() as $r) {
    $products[] = [
        'id'          => (int) $r['id'],
        'slug'        => $r['slug'],
        'category'    => $r['category'],
        'name'        => $r['name'],
        'description' => $r['description'],
        'image'       => $r['image'],
        'emoji'       => $r['emoji'],
        'price'       => (int) $r['price'],
        'available'   => (bool) $r['available'],
        'sort'        => (int) $r['sort'],

        /* Qué opciones abre este producto. '' = lo que diga la categoría. */
        'optionSet'   => (string) ($r['option_set'] ?? ''),
    ];
}

/* Las categorías, con cuántos productos tiene cada una: el panel necesita el
   número para saber si puede ofrecer el botón de borrar. Se cuenta acá en vez
   de contar del lado del cliente porque el panel solo ve los productos, no
   los que quedaron apuntando a una categoría que ya no existe. */
$counts = [];
foreach ($pdo->query('SELECT category, COUNT(*) AS n FROM products GROUP BY category')->fetchAll() as $row) {
    $counts[(string) $row['category']] = (int) $row['n'];
}

$categories = [];
foreach (byr_menu_categories($pdo) as $slug => $cat) {
    $categories[] = $cat + ['products' => $counts[$slug] ?? 0];
}

json_out([
    'products' => $products,

    /* Para el desplegable de categoría y para el bloque que las edita. */
    'categories'      => $categories,
    'categoriesReady' => byr_categories_ready($pdo),

    /* Los juegos de opciones que el panel puede ofrecer, para armar el
       desplegable sin repetir la lista del lado del cliente. Agregar uno en
       menu-options.php lo hace aparecer acá solo. */
    'optionSets' => byr_option_set_choices(),

    /* Si falta correr la migración, el panel esconde el desplegable en vez de
       ofrecer algo que no se va a poder guardar. */
    'optionSetReady' => byr_product_option_set_ready($pdo),
]);
