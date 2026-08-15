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

    $sets['staff'] = array_map(static function (array $g): array {
        $g['required'] = false;
        return $g;
    }, $sets['burger']);

    return $sets;
}

/** Qué set de opciones usa cada categoría (null = sin opciones, va directo al carrito). */
function byr_option_set_for_category(string $category): ?string
{
    // Hoy solo las burgers individuales tienen popup. Las promos ya vienen armadas.
    return $category === 'hamburguesas' ? 'burger' : null;
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
