<?php
/**
 * Opciones del menú (papas, bebida, adicionales) — FUENTE DE VERDAD server-side.
 *
 * Las burgers abren un popup con estos grupos. Los precios se validan y suman
 * SIEMPRE acá (nunca se confía en lo que mande el navegador). Para cambiar
 * precios/opciones, se edita este archivo (como el menú).
 *
 * Estructura de un grupo:
 *   id       identificador estable del grupo
 *   title    texto que ve el cliente
 *   type     'single' (elegí una) | 'multi' (varias)
 *   required true = obligatorio elegir
 *   options  [ { id, name, price(delta en $) } ]
 */

/**
 * Sets de opciones disponibles.
 *
 *  'burger' — el que ve el cliente al pedir una hamburguesa.
 *  'addons' — el que ve en TODO el resto (entradas, papas, postres, promos…):
 *             solo los agregados de papas y bebida, con cantidad.
 *  'staff'  — el 'burger' completo pero con NADA obligatorio. Es el que usa el
 *             panel para editar un pedido: ahí se le puede sumar un adicional a
 *             cualquier cosa, y no tendría sentido obligar a elegir "¿cómo
 *             querés las papas?" para una Coca.
 *
 * OJO con la diferencia entre los dos grupos de papas:
 *   'papas'       (solo burgers) = CÓMO querés las que YA VIENEN con la burger.
 *                 Obligatorio, se elige una, y los precios son el upgrade.
 *   'papas-extra' (todos)        = porciones que se SUMAN al pedido, con
 *                 cantidad, a los mismos precios que en la carta.
 */
function byr_option_sets(): array
{
    /* Porciones que se suman al pedido. Los precios son los mismos que en la
       carta (tabla `products`, categoría papas): si alguien ve $4.000 en la
       sección Papas, tiene que ver $4.000 acá. Si cambiás uno, cambiá el otro. */
    $papasExtra = [
        'id'       => 'papas-extra',
        'title'    => '¿Sumás papas?',
        'type'     => 'multi',
        'required' => false,
        'options'  => [
            ['id' => 'papas-individual', 'name' => 'Porción individual de papas', 'price' => 4000],
            ['id' => 'papas-a-caballo',  'name' => 'Papas a Caballo',             'price' => 11000],
            ['id' => 'papas-xxl',        'name' => 'Papas XXL',                   'price' => 12500],
            ['id' => 'papas-meat',       'name' => 'Papas Meat',                  'price' => 15000],
        ],
    ];

    /* Bebidas. Van como 'multi' para poder pedir dos Cocas: antes eran 'single'
       y no había forma de sumar más de una. */
    $bebidaExtra = [
        'id'       => 'bebida-extra',
        'title'    => '¿Sumás bebida?',
        'type'     => 'multi',
        'required' => false,
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
    ];

    $sets = [
        'burger' => [
            [
                'id'       => 'papas',
                'title'    => '¿Cómo querés las papas que vienen?',
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
            $papasExtra,
            $bebidaExtra,
        ],

        /* Todo lo que no es hamburguesa: solo los agregados. */
        'addons' => [
            $papasExtra,
            $bebidaExtra,
        ],
    ];

    $sets['staff'] = array_map(static function (array $g): array {
        $g['required'] = false;
        return $g;
    }, $sets['burger']);

    return $sets;
}

/** Qué set de opciones usa cada categoría (null = sin opciones, va directo al carrito). */
function byr_option_set_for_category(string $category): ?string
{
    /* Las burgers abren el popup completo (estilo de las papas incluidas +
       adicionales + agregados). Todo lo demás abre el corto: solo papas y
       bebida para sumar, con cantidad.

       Antes solo las hamburguesas tenían popup y el resto no, así que alguien
       que pedía un postre o una entrada no tenía forma de sumarle una bebida:
       las bebidas sueltas son staff_only y no salen en la carta. */
    return $category === 'hamburguesas' ? 'burger' : 'addons';
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
