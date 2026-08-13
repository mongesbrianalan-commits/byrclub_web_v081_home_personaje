<?php
/**
 * Lista TODOS los productos del menú (incluidos los no disponibles) para el
 * editor del panel admin. Solo admin.
 */
require_once __DIR__ . '/../helpers.php';

$pdo = db();
require_admin($pdo);

$stmt = $pdo->query(
    'SELECT id, slug, category, name, description, image, emoji, price, available, sort
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
    ];
}

json_out(['products' => $products]);
