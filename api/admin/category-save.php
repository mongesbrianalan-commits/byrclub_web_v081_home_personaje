<?php
/**
 * Crea o edita una categoría del menú. Solo admin.
 *
 * El SLUG es el identificador estable: los productos lo guardan, así que se
 * arma una sola vez a partir del nombre y no vuelve a cambiar. Renombrar
 * "Burgers" a "Hamburguesas" cambia lo que ve el cliente y deja los
 * productos donde estaban.
 *
 * Body JSON:
 *   slug?      string  (si viene, EDITA esa categoría; si no, CREA una nueva)
 *   name       string  (lo que ve el cliente)
 *   emoji?     string
 *   optionSet? string  ('' = sin opciones; 'burger' | 'bebida')
 *   sort?      int
 *   available? bool
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-options.php';
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

$in        = body_json();
$slug      = byr_slugify((string) ($in['slug'] ?? ''));
$name      = trim((string) ($in['name'] ?? ''));
$emoji     = trim((string) ($in['emoji'] ?? ''));
$sort      = (int) ($in['sort'] ?? 0);
$available = array_key_exists('available', $in) ? (!empty($in['available']) ? 1 : 0) : 1;

/* Qué opciones abren los productos de esta categoría. Se valida contra la
   lista real: nadie guarda un juego inventado. '' = ninguna. */
$optionSet = trim((string) ($in['optionSet'] ?? ''));
if (!array_key_exists($optionSet, byr_option_set_choices()) || $optionSet === 'none') {
    $optionSet = '';
}

if ($name === '') {
    json_out(['error' => 'La categoría necesita un nombre.'], 422);
}

/* --- Editar --- */
if ($slug !== '') {
    if (!byr_category_exists($pdo, $slug)) {
        json_out(['error' => 'No existe esa categoría.'], 404);
    }

    $stmt = $pdo->prepare(
        'UPDATE menu_categories
            SET name = ?, emoji = ?, option_set = ?, sort = ?, available = ?
          WHERE slug = ?'
    );
    $stmt->execute([$name, $emoji ?: null, $optionSet ?: null, $sort, $available, $slug]);

    json_out(['ok' => true, 'slug' => $slug]);
}

/* --- Crear --- */
$slug = byr_slugify($name);
if ($slug === '') {
    /* Un nombre que no deja ni una letra ni un número (solo emojis, por
       ejemplo) no puede ser un identificador. */
    json_out([
        'error' => 'Ese nombre no sirve como identificador. Poné al menos una letra o un número.',
        'code'  => 'bad-slug',
    ], 422);
}

if (byr_category_exists($pdo, $slug)) {
    json_out(['error' => 'Ya existe una categoría con ese nombre.', 'code' => 'dup-slug'], 409);
}

/* Sin orden indicado, al final de todo: una categoría nueva no se mete
   sola en el medio de la carta. */
if (!array_key_exists('sort', $in)) {
    $max  = (int) $pdo->query('SELECT COALESCE(MAX(sort), 0) FROM menu_categories')->fetchColumn();
    $sort = $max + 10;
}

$ins = $pdo->prepare(
    'INSERT INTO menu_categories (slug, name, emoji, option_set, sort, available)
     VALUES (?, ?, ?, ?, ?, ?)'
);
$ins->execute([$slug, $name, $emoji ?: null, $optionSet ?: null, $sort, $available]);

json_out(['ok' => true, 'slug' => $slug, 'created' => true]);
