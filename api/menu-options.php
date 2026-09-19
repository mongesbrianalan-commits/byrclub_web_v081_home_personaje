<?php
/**
 * Opciones del menú (papas, bebida, adicionales) — FUENTE DE VERDAD server-side.
 *
 * Las burgers abren un popup con estos grupos. Los precios se validan y suman
 * SIEMPRE acá (nunca se confía en lo que mande el navegador).
 *
 * LAS BEBIDAS SON LA EXCEPCIÓN: salen de la carta, no de este archivo.
 * Estaban escritas acá y también en la tabla `products` (los `beb-*` que se
 * venden sueltos en el mostrador) — la misma Coca a $2.800 anotada en dos
 * lugares. Editar el precio en la pestaña Menú del panel cambiaba el del
 * mostrador y dejaba el del popup como estaba, así que la misma bebida se
 * cobraba distinto según cómo la pidieras, y no había forma de arreglarlo
 * sin desplegar.
 *
 * Ahora el popup lee la carta: el precio, el nombre y hasta si aparece
 * (una bebida marcada como no disponible desaparece del popup) se manejan
 * desde el panel. La lista de abajo quedó como respaldo, para el caso de
 * que la carta no tenga bebidas cargadas.
 *
 * Lo demás —papas y adicionales— sigue acá: no son productos de la carta,
 * son modificaciones de la hamburguesa.
 *
 * Estructura de un grupo:
 *   id       identificador estable del grupo
 *   title    texto que ve el cliente
 *   type     'single' (elegí una) | 'multi' (varias)
 *   required true = obligatorio elegir
 *   options  [ { id, name, price(delta en $) } ]
 */
require_once __DIR__ . '/helpers.php';

/**
 * Qué id de opción le corresponde a cada bebida de la carta.
 *
 * Los ids los manda el navegador al pedir, así que no pueden cambiar de un
 * día para el otro: por eso se mapean a mano en vez de derivarlos del slug.
 * Dos no siguen el patrón ('beb-agua' es 'agua-sin-gas', 'beb-imperial' es
 * 'imperial-golden') justamente porque se eligieron antes que los slugs.
 *
 * Una bebida nueva que se cargue en el panel y no esté acá igual aparece:
 * su id sale del slug sin el 'beb-'.
 */
const BYR_DRINK_OPTION_ID = [
    'beb-pepsi'          => 'pepsi',
    'beb-coca'           => 'coca',
    'beb-sprite'         => 'sprite',
    'beb-fanta'          => 'fanta',
    'beb-levite-naranja' => 'levite-naranja',
    'beb-levite-manzana' => 'levite-manzana',
    'beb-levite-pomelo'  => 'levite-pomelo',
    'beb-agua'           => 'agua-sin-gas',
    'beb-quilmes'        => 'quilmes',
    'beb-amstel'         => 'amstel',
    'beb-imperial'       => 'imperial-golden',
];

/**
 * Las bebidas del popup, leídas de la carta.
 *
 * Solo las disponibles: si se acabó la Pepsi, se destilda en el panel y deja
 * de ofrecerse, en vez de venderla y tener que avisar después.
 *
 * Devuelve null si no hay bebidas cargadas (la migración de bebidas sin
 * correr, o alguien que las borró todas). En ese caso manda la lista de
 * respaldo: es preferible cobrar el precio de ayer que abrir el popup sin
 * ninguna bebida.
 */
function byr_drink_options(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }

    try {
        $rows = db()->query(
            "SELECT slug, name, price
               FROM products
              WHERE category = 'bebidas' AND available = 1
              ORDER BY sort ASC, id ASC"
        )->fetchAll();
    } catch (Throwable $e) {
        return $cache = null;
    }

    $options = [];
    foreach ($rows as $row) {
        $slug = (string) $row['slug'];

        $options[] = [
            'id'    => BYR_DRINK_OPTION_ID[$slug] ?? preg_replace('/^beb-/', '', $slug),
            'name'  => (string) $row['name'],
            'price' => (int) $row['price'],
        ];
    }

    return $cache = ($options ?: null);
}

/**
 * Sets de opciones disponibles.
 *
 *  'burger' — el que ve el cliente en pedir.html al pedir una hamburguesa.
 *  'staff'  — el mismo, pero con NADA obligatorio. Es el que usa el panel para
 *             editar un pedido: ahí se le puede sumar un adicional a cualquier
 *             cosa (una gaseosa, unas papas), y no tendría sentido obligar a
 *             elegir "¿cómo querés las papas?" para una Coca.
 */
function byr_option_sets(): array
{
    $sets = [
        'burger' => [
            [
                'id'       => 'papas',
                'title'    => '¿Cómo querés las papas?',
                'type'     => 'single',
                'required' => true,
                'options'  => [
                    ['id' => 'simples',             'name' => 'Simples',                'price' => 0],
                    ['id' => 'extra-alioli',        'name' => 'Extra alioli',           'price' => 2000],
                    ['id' => 'extra-cheddar',       'name' => 'Extra cheddar',          'price' => 3500],
                    ['id' => 'extra-cheddar-bacon', 'name' => 'Extra cheddar y bacon',  'price' => 6990],
                ],
            ],
            [
                'id'       => 'bebida',
                'title'    => '¿Sumás bebida?',
                'type'     => 'single',
                'required' => false,

                /* RESPALDO. Lo normal es que byr_drink_options() pise esta
                   lista con la carta, unas líneas más abajo. Queda por si no
                   hay bebidas cargadas, para que el popup no salga vacío. */
                'options'  => [
                    ['id' => 'pepsi',          'name' => 'Pepsi',           'price' => 2500],
                    ['id' => 'coca',           'name' => 'Coca-Cola',       'price' => 2800],
                    ['id' => 'sprite',         'name' => 'Sprite',          'price' => 2800],
                    ['id' => 'fanta',          'name' => 'Fanta',           'price' => 2800],
                    ['id' => 'levite-naranja', 'name' => 'Levite Naranja',  'price' => 2500],
                    ['id' => 'levite-manzana', 'name' => 'Levite Manzana',  'price' => 2500],
                    ['id' => 'levite-pomelo',  'name' => 'Levite Pomelo',   'price' => 2500],
                    ['id' => 'agua-sin-gas',   'name' => 'Agua sin gas',    'price' => 2000],
                    ['id' => 'quilmes',        'name' => 'Quilmes',         'price' => 3000],
                    ['id' => 'amstel',         'name' => 'Amstel',          'price' => 3000],
                    ['id' => 'imperial-golden','name' => 'Imperial Golden', 'price' => 3500],
                ],
            ],
            [
                'id'       => 'extras',
                'title'    => '¿Le añadís algo?',
                'type'     => 'multi',
                'required' => false,
                'options'  => [
                    ['id' => 'carne-extra',          'name' => 'Carne extra',              'price' => 3500],
                    ['id' => 'cheddar',              'name' => 'Cheddar para hamburguesa', 'price' => 1500],
                    ['id' => 'panceta',              'name' => 'Panceta para hamburguesa', 'price' => 1500],
                    ['id' => 'pepino',               'name' => 'Pepino',                   'price' => 500],
                    ['id' => 'lechuga',              'name' => 'Lechuga',                  'price' => 500],
                    ['id' => 'tomate',               'name' => 'Tomate',                   'price' => 500],
                    ['id' => 'dambo',                'name' => 'Queso Dambo (blanco)',     'price' => 1500],
                    ['id' => 'huevo',                'name' => 'Huevo',                    'price' => 1000],
                    ['id' => 'cebolla-caramelizada', 'name' => 'Cebolla caramelizada',     'price' => 1000],
                    ['id' => 'cebolla-cubos',        'name' => 'Cebolla en cubos',         'price' => 500],
                    ['id' => 'cebolla-crispy',       'name' => 'Cebolla crispy',           'price' => 1000],
                ],
            ],
        ],
    ];

    /* Las bebidas salen de la carta. La lista escrita arriba es el respaldo
       para cuando no hay ninguna cargada. Se pisan ACÁ, antes de armar los
       otros juegos, para que 'bebida' y 'staff' hereden lo mismo. */
    $fromMenu = byr_drink_options();
    if ($fromMenu !== null) {
        foreach ($sets['burger'] as $i => $group) {
            if ($group['id'] === 'bebida') {
                $sets['burger'][$i]['options'] = $fromMenu;
                break;
            }
        }
    }

    /* Solo el grupo de bebida, para asignárselo desde el panel a lo que no es
       hamburguesa (un postre, una entrada). Es el MISMO grupo, no una copia:
       si mañana cambia un precio de bebida, cambia en los dos lados.

       Ojo: no hay un juego de "papas" suelto todavía. En la hamburguesa las
       papas VIENEN INCLUIDAS y por eso "Simples" sale $0; copiar ese grupo a
       un postre regalaría una porción. Para tener uno hace falta decidir qué
       precio tienen las papas cuando se suman a algo que no es burger. */
    $sets['bebida'] = array_values(array_filter(
        $sets['burger'],
        static fn(array $g): bool => $g['id'] === 'bebida'
    ));

    $sets['staff'] = array_map(static function (array $g): array {
        $g['required'] = false;
        return $g;
    }, $sets['burger']);

    return $sets;
}

/**
 * Los juegos que se pueden elegir desde el panel, con su nombre para mostrar.
 * 'staff' no está: es interno del panel para editar pedidos, no se le asigna
 * a un producto.
 */
function byr_option_set_choices(): array
{
    return [
        ''       => 'Lo que diga la categoría',
        'none'   => 'Sin opciones (va directo al carrito)',
        'burger' => 'Como las hamburguesas (papas, bebida y adicionales)',
        'bebida' => 'Solo bebida',
    ];
}

/**
 * ¿Está corrida la migración de opciones por producto
 * (2026-08-product-option-set.sql)? Sin esa columna, pedirla en un SELECT
 * rompe el menú entero, así que las consultas la piden solo si existe y si no
 * mandan NULL — que significa "lo que diga la categoría", o sea lo de siempre.
 * Cachea el resultado.
 */
function byr_product_option_set_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM products LIKE 'option_set'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/** Trozo de SELECT para traer la columna sin romper si falta la migración. */
function byr_option_set_select(PDO $pdo): string
{
    return byr_product_option_set_ready($pdo) ? 'option_set' : 'NULL AS option_set';
}

/** Qué set usa cada categoría, cuando el producto no tiene uno propio. */
function byr_option_set_for_category(string $category): ?string
{
    // Las burgers individuales abren el popup. Las promos ya vienen armadas.
    return $category === 'hamburguesas' ? 'burger' : null;
}

/**
 * Qué set de opciones usa UN PRODUCTO (null = sin opciones, va directo al
 * carrito).
 *
 * Manda lo que el admin haya elegido en la pestaña Menú; si no eligió nada
 * (columna en NULL), se usa el default de la categoría, que es como venía
 * funcionando. Resiliente si falta correr la migración: sin la columna, se
 * comporta igual que antes.
 */
function byr_option_set_for_product(array $product): ?string
{
    $own = $product['option_set'] ?? null;

    if ($own === 'none') {
        return null;                 // el admin lo dejó sin opciones a propósito
    }
    if (is_string($own) && $own !== '' && isset(byr_option_sets()[$own])) {
        return $own;
    }

    return byr_option_set_for_category((string) ($product['category'] ?? 'otros'));
}

/**
 * Valida la selección del cliente contra el set y devuelve el precio extra + un
 * texto legible. Nunca confía en precios del cliente: los toma de acá.
 *
 * $selected: [ groupId => optionId(single) | [optionIds](multi) ]
 *
 * En los grupos 'multi' un id puede venir REPETIDO: así se piden dos fetas de
 * cheddar (["cheddar","cheddar"]). Se cobra cada repetición y el texto sale
 * como "Cheddar para hamburguesa x2".
 *
 * Devuelve: ['ok'=>true,'delta'=>int,'text'=>string] o ['ok'=>false,'error'=>string]
 */
function byr_resolve_options(?string $setKey, array $selected): array
{
    if ($setKey === null) {
        return ['ok' => true, 'delta' => 0, 'text' => ''];
    }
    $groups = byr_option_sets()[$setKey] ?? null;
    if (!$groups) {
        return ['ok' => true, 'delta' => 0, 'text' => ''];
    }

    $delta = 0;
    $parts = [];

    foreach ($groups as $g) {
        $sel = $selected[$g['id']] ?? null;

        $byId = [];
        foreach ($g['options'] as $o) {
            $byId[$o['id']] = $o;
        }

        if ($g['type'] === 'single') {
            $sel = is_array($sel) ? (string) ($sel[0] ?? '') : (string) ($sel ?? '');
            if ($sel === '') {
                if (!empty($g['required'])) {
                    return ['ok' => false, 'error' => 'Falta elegir: ' . $g['title']];
                }
                continue;
            }
            if (!isset($byId[$sel])) {
                return ['ok' => false, 'error' => 'Opción inválida en "' . $g['title'] . '".'];
            }
            $delta  += (int) $byId[$sel]['price'];
            $parts[] = $byId[$sel]['name'];
        } else { // multi
            $arr = is_array($sel) ? $sel : ($sel !== null && $sel !== '' ? [$sel] : []);
            /* Tope de cordura: nadie pide 60 adicionales en una hamburguesa. */
            if (count($arr) > 60) {
                return ['ok' => false, 'error' => 'Demasiados adicionales en "' . $g['title'] . '".'];
            }

            /* Se cuentan las repeticiones para cobrar cada una y mostrar "x2". */
            $counts = [];
            foreach ($arr as $id) {
                $id = (string) $id;
                if (!isset($byId[$id])) {
                    return ['ok' => false, 'error' => 'Adicional inválido en "' . $g['title'] . '".'];
                }
                $delta += (int) $byId[$id]['price'];
                $counts[$id] = ($counts[$id] ?? 0) + 1;
            }

            $names = [];
            foreach ($counts as $id => $n) {
                $names[] = $byId[$id]['name'] . ($n > 1 ? ' x' . $n : '');
            }
            if ($names) {
                $parts[] = implode(', ', $names);
            } elseif (!empty($g['required'])) {
                return ['ok' => false, 'error' => 'Falta elegir: ' . $g['title']];
            }
        }
    }

    return ['ok' => true, 'delta' => $delta, 'text' => implode(' · ', $parts)];
}
