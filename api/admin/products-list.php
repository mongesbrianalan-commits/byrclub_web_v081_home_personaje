<?php
/**
 * Lista TODOS los productos del menú (incluidos los no disponibles) para el
 * editor del panel admin. Solo admin.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-options.php';

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

json_out([
    'products' => $products,

    /* Los juegos de opciones que el panel puede ofrecer, para armar el
       desplegable sin repetir la lista del lado del cliente. Agregar uno en
       menu-options.php lo hace aparecer acá solo. */
    'optionSets' => byr_option_set_choices(),

    /* Si falta correr la migración, el panel esconde el desplegable en vez de
       ofrecer algo que no se va a poder guardar. */
    'optionSetReady' => byr_product_option_set_ready($pdo),
]);
