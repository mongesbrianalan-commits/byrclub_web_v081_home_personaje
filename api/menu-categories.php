<?php
/**
 * BYR Club — las categorías de la carta (Promos, Burgers, Papas…).
 *
 * Antes vivían en cuatro lugares a la vez: el ENUM de `products.category`,
 * la lista de api/menu.php (nombre y orden), el whitelist de
 * api/admin/product-save.php y el desplegable del panel. Agregar una
 * categoría pedía un ALTER TABLE más tres archivos, así que desde el panel
 * no había forma: el ENUM rechazaba cualquier valor que no conociera.
 *
 * Ahora son una tabla y esto es lo único que la lee. El panel la edita como
 * edita los productos.
 *
 * La lista escrita abajo quedó de RESPALDO, para el rato entre desplegar
 * este código y correr la migración: sin ella la carta se quedaría sin
 * categorías, o sea sin menú.
 */
require_once __DIR__ . '/helpers.php';

/**
 * Las ocho de siempre, con el nombre, el emoji y el orden que tenían
 * escritos en api/menu.php. Es exactamente lo que siembra la migración.
 */
const BYR_FALLBACK_CATEGORIES = [
    'promos'       => ['name' => 'Promos',   'emoji' => '🔥', 'option_set' => null,     'sort' => 10],
    'entradas'     => ['name' => 'Entradas', 'emoji' => '🍗', 'option_set' => null,     'sort' => 20],
    'hamburguesas' => ['name' => 'Burgers',  'emoji' => '🍔', 'option_set' => 'burger', 'sort' => 30],
    'papas'        => ['name' => 'Papas',    'emoji' => '🍟', 'option_set' => null,     'sort' => 40],
    'postres'      => ['name' => 'Postres',  'emoji' => '🍰', 'option_set' => null,     'sort' => 50],
    'bebidas'      => ['name' => 'Bebidas',  'emoji' => '🥤', 'option_set' => null,     'sort' => 60],
    'combos'       => ['name' => 'Combos',   'emoji' => '👑', 'option_set' => null,     'sort' => 70],
    'otros'        => ['name' => 'Otros',    'emoji' => '🍴', 'option_set' => null,     'sort' => 80],
];

/**
 * ¿Está corrida la migración (2026-09-menu-categories.sql)? Sin la tabla se
 * usa el respaldo y todo sigue funcionando como antes — lo único que no se
 * puede es agregar una categoría, que es justo lo que trae la migración.
 * Cachea el resultado.
 */
function byr_categories_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            /* Se prueba leyéndola en vez de preguntar si existe: así también
               da false si la tabla está pero no se puede leer, que para el
               caso es lo mismo (hay que usar el respaldo). */
            $pdo->query('SELECT 1 FROM menu_categories LIMIT 1');
            $ready = true;
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * Todas las categorías, indexadas por slug y en orden de carta.
 *
 * Cada una trae 'slug', 'name', 'emoji', 'label' (el emoji y el nombre ya
 * pegados, que es lo que dibuja la carta), 'option_set', 'sort' y
 * 'available'.
 *
 * Incluye las ocultas: quien las esconde de la carta es el que consulta
 * (byr_menu_categories_visible), porque el panel SÍ tiene que verlas para
 * poder volver a prenderlas.
 */
function byr_menu_categories(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $rows = null;
    if (byr_categories_ready($pdo)) {
        try {
            $rows = $pdo->query(
                'SELECT slug, name, emoji, option_set, sort, available
                   FROM menu_categories
                  ORDER BY sort ASC, id ASC'
            )->fetchAll();
        } catch (Throwable $e) {
            $rows = null;
        }
    }

    /* Sin tabla (o sin filas): el respaldo, que es lo de siempre. */
    if (!$rows) {
        $rows = [];
        foreach (BYR_FALLBACK_CATEGORIES as $slug => $c) {
            $rows[] = $c + ['slug' => $slug, 'available' => 1];
        }
    }

    $out = [];
    foreach ($rows as $row) {
        $slug  = (string) $row['slug'];
        $name  = (string) $row['name'];
        $emoji = (string) ($row['emoji'] ?? '');

        $out[$slug] = [
            'slug'       => $slug,
            'name'       => $name,
            'emoji'      => $emoji,
            'label'      => trim($emoji . ' ' . $name),
            'option_set' => ($row['option_set'] ?? null) ?: null,
            'sort'       => (int) $row['sort'],
            'available'  => (bool) $row['available'],
        ];
    }

    return $cache = $out;
}

/** Solo las que se muestran en la carta. */
function byr_menu_categories_visible(PDO $pdo): array
{
    return array_filter(byr_menu_categories($pdo), static fn(array $c): bool => $c['available']);
}

/** ¿Existe esta categoría? Lo usa el guardado de productos. */
function byr_category_exists(PDO $pdo, string $slug): bool
{
    return isset(byr_menu_categories($pdo)[$slug]);
}

/**
 * El nombre para mostrar de una categoría. Una que no exista (un producto
 * que quedó apuntando a una categoría borrada) cae en "Otros" en vez de
 * mostrar el slug crudo.
 */
function byr_category_label(PDO $pdo, string $slug): string
{
    $cats = byr_menu_categories($pdo);

    return $cats[$slug]['label']
        ?? ($cats['otros']['label'] ?? 'Otros');
}
