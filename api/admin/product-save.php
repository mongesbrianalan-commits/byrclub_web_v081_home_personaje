<?php
/**
 * Crea o edita un producto del menú. Solo admin.
 *
 * Body JSON:
 *   id?         int      (si viene, EDITA ese producto; si no, CREA uno nuevo)
 *   slug?       string   (requerido al crear; id estable)
 *   category    string   (hamburguesas|combos|papas|bebidas|otros)
 *   name        string
 *   description string
 *   image?      string   (ruta bajo assets/ ; opcional)
 *   emoji?      string
 *   price       int      (ARS enteros)
 *   available   bool
 *   sort?       int
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-options.php';
require_method('POST');

$pdo = db();
require_admin($pdo);

const BYR_PRODUCT_CATEGORIES = ['promos', 'entradas', 'hamburguesas', 'combos', 'papas', 'postres', 'bebidas', 'otros'];

$in          = body_json();
$id          = (int) ($in['id'] ?? 0);
$slug        = strtolower(trim((string) ($in['slug'] ?? '')));
$category    = (string) ($in['category'] ?? 'otros');
$name        = trim((string) ($in['name'] ?? ''));
$description = trim((string) ($in['description'] ?? ''));
$image       = trim((string) ($in['image'] ?? ''));
$emoji       = trim((string) ($in['emoji'] ?? ''));
$price       = (int) ($in['price'] ?? 0);
$available   = !empty($in['available']) ? 1 : 0;
$sort        = (int) ($in['sort'] ?? 0);

/* Qué opciones abre este producto. '' = lo que diga la categoría (default de
   siempre). Se valida contra la lista real: nadie guarda un juego inventado. */
$optionSet   = trim((string) ($in['optionSet'] ?? ''));
if (!array_key_exists($optionSet, byr_option_set_choices())) {
    $optionSet = '';
}
$hasOptCol   = byr_product_option_set_ready($pdo);

if (!in_array($category, BYR_PRODUCT_CATEGORIES, true)) {
    $category = 'otros';
}
if ($name === '') {
    json_out(['error' => 'El producto necesita un nombre.'], 422);
}
if ($price < 0) {
    json_out(['error' => 'El precio no puede ser negativo.'], 422);
}

if ($id > 0) {
    /* --- Editar --- */
    /* La columna de opciones solo se toca si está corrida su migración: así el
       panel sigue guardando precios y disponibilidad aunque falte. */
    $setCol  = $hasOptCol ? ', option_set = ?' : '';
    $setArgs = $hasOptCol ? [$optionSet !== '' ? $optionSet : null] : [];

    $stmt = $pdo->prepare(
        'UPDATE products
            SET category = ?, name = ?, description = ?, image = ?, emoji = ?,
                price = ?, available = ?, sort = ?' . $setCol . '
          WHERE id = ?'
    );
    $stmt->execute(array_merge([
        $category, $name, $description ?: null, $image ?: null, $emoji ?: null,
        $price, $available, $sort,
    ], $setArgs, [$id]));
    if ($stmt->rowCount() === 0) {
        /* Puede que no haya cambios; confirmamos que exista igual. */
        $chk = $pdo->prepare('SELECT 1 FROM products WHERE id = ?');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            json_out(['error' => 'No existe ese producto.'], 404);
        }
    }
    json_out(['ok' => true, 'id' => $id]);
}

/* --- Crear --- */
if ($slug === '') {
    /* Generamos un slug simple a partir del nombre. */
    $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($name));
    $slug = trim($slug, '-') ?: ('prod-' . time());
}

$chk = $pdo->prepare('SELECT id FROM products WHERE slug = ?');
$chk->execute([$slug]);
if ($chk->fetch()) {
    json_out(['error' => 'Ya existe un producto con ese identificador (slug).', 'code' => 'dup-slug'], 409);
}

$insCol  = $hasOptCol ? ', option_set' : '';
$insVal  = $hasOptCol ? ', ?' : '';
$insArgs = $hasOptCol ? [$optionSet !== '' ? $optionSet : null] : [];

$ins = $pdo->prepare(
    'INSERT INTO products (slug, category, name, description, image, emoji, price, available, sort' . $insCol . ')
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?' . $insVal . ')'
);
$ins->execute(array_merge([
    $slug, $category, $name, $description ?: null, $image ?: null, $emoji ?: null,
    $price, $available, $sort,
], $insArgs));

json_out(['ok' => true, 'id' => (int) $pdo->lastInsertId(), 'slug' => $slug]);
