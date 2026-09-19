<?php
/**
 * Borra una categoría del menú. Solo admin.
 *
 * No se borra una categoría que tenga productos: quedarían apuntando a algo
 * que no existe y aparecerían en la carta bajo "Otros", que no es lo que
 * nadie quiso. Primero se mueven los productos (o se los saca de la carta).
 *
 * "Otros" tampoco se borra: es el cajón donde caen los productos cuya
 * categoría desapareció. Sin ese cajón, un producto huérfano no tendría
 * dónde mostrarse.
 *
 * Body JSON: { slug }
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-categories.php';
require_method('POST');

$pdo = db();
require_admin($pdo);

if (!byr_categories_ready($pdo)) {
    json_out([
        'error' => 'Todavía no se pueden editar las categorías. (Falta correr 2026-09-menu-categories.sql.)',
        'code'  => 'categories-not-ready',
    ], 503);
}

$in   = body_json();
$slug = byr_slugify((string) ($in['slug'] ?? ''));

if ($slug === '' || !byr_category_exists($pdo, $slug)) {
    json_out(['error' => 'No existe esa categoría.'], 404);
}

if ($slug === 'otros') {
    json_out([
        'error' => '"Otros" no se puede borrar: es donde caen los productos que se quedan sin categoría.',
        'code'  => 'protected',
    ], 422);
}

$stmt = $pdo->prepare('SELECT COUNT(*) FROM products WHERE category = ?');
$stmt->execute([$slug]);
$count = (int) $stmt->fetchColumn();

if ($count > 0) {
    json_out([
        'error' => 'Esa categoría tiene ' . $count . ' producto' . ($count === 1 ? '' : 's')
                 . '. Movelos a otra categoría antes de borrarla.',
        'code'  => 'has-products',
        'count' => $count,
    ], 409);
}

$del = $pdo->prepare('DELETE FROM menu_categories WHERE slug = ?');
$del->execute([$slug]);

json_out(['ok' => true, 'slug' => $slug]);
