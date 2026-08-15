<?php
/**
 * Edita un pedido que TODAVÍA está pendiente (antes de aceptarlo), para agregar
 * lo que el cliente pidió sumar y que el total sea real. Solo staff.
 *
 * Los precios se recalculan SIEMPRE del lado del servidor. Solo se puede editar
 * si el pedido sigue en 'pending' (una vez aceptado, ya se cobró/acreditó).
 *
 * Body JSON:
 *   { orderId, action: "addItem",        slug, qty, options?, note? }  agrega del menú
 *   { orderId, action: "setItemQty",     itemId, qty }                 cambia cantidad (0 = quita)
 *   { orderId, action: "setItemOptions", itemId, options?, note? }     cambia las opciones
 *
 * Se puede agregar CUALQUIER producto del menú, incluidas las hamburguesas con
 * sus opciones (papas/bebida/adicionales), igual que en pedir.html y mostrador.
 * Las opciones se validan y tarifan server-side con byr_resolve_options().
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../menu-options.php';
require_method('POST');

$pdo   = db();
$staff = require_role($pdo, ['cajero']);

/**
 * Junta el texto de las opciones con la aclaración libre ("sin cebolla"), con
 * el mismo formato que usan pedir.html y el mostrador, para que la comanda de
 * cocina se lea igual venga de donde venga.
 */
function byr_edit_options_text(string $optionsText, $note): ?string
{
    $note = trim((string) $note);
    $note = preg_replace('/\s+/u', ' ', $note);
    $note = function_exists('mb_substr') ? mb_substr($note, 0, 200) : substr($note, 0, 200);
    if ($note !== '') {
        $optionsText = ($optionsText !== '' ? $optionsText . ' · ' : '') . '📝 ' . $note;
    }
    return $optionsText !== '' ? $optionsText : null;
}

$in      = body_json();
$orderId = (int) ($in['orderId'] ?? 0);
$action  = (string) ($in['action'] ?? '');
if ($orderId <= 0) {
    json_out(['error' => 'Falta el pedido.'], 422);
}

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT id, status FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        $pdo->rollBack();
        json_out(['error' => 'No existe ese pedido.'], 404);
    }
    if ($order['status'] !== 'pending') {
        $pdo->rollBack();
        json_out(['error' => 'Solo se puede editar un pedido que todavía no aceptaste.', 'status' => $order['status']], 409);
    }

    if ($action === 'addItem') {
        $slug = trim((string) ($in['slug'] ?? ''));
        $qty  = min((int) ($in['qty'] ?? 1), 50);
        if ($slug === '' || $qty <= 0) {
            $pdo->rollBack();
            json_out(['error' => 'Elegí un producto y una cantidad.'], 422);
        }
        $p = $pdo->prepare('SELECT id, name, price, category FROM products WHERE slug = ? AND available = 1');
        $p->execute([$slug]);
        $prod = $p->fetch();
        if (!$prod) {
            $pdo->rollBack();
            json_out(['error' => 'Ese producto no está disponible.'], 422);
        }

        /* Opciones (papas/bebida/adicionales) validadas y tarifadas por el server,
           igual que en create.php y pos-sale.php.

           Las burgers usan su set de siempre (papas obligatorias). Cualquier
           otra cosa usa 'staff': los mismos adicionales pero nada obligatorio,
           para poder sumarle una feta de cheddar a unas papas sin que el
           sistema exija elegir "¿cómo querés las papas?" para una gaseosa. */
        $setKey   = byr_option_set_for_category($prod['category']) ?? 'staff';
        $selected = is_array($in['options'] ?? null) ? $in['options'] : [];
        $opt      = byr_resolve_options($setKey, $selected);
        if (!$opt['ok']) {
            $pdo->rollBack();
            json_out(['error' => $opt['error'], 'code' => 'option-invalid'], 422);
        }

        $optionsText = byr_edit_options_text($opt['text'], $in['note'] ?? '');
        $unit        = (int) $prod['price'] + (int) $opt['delta'];
        $ins = $pdo->prepare(
            'INSERT INTO order_items (order_id, product_id, name, options, unit_price, qty, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([$orderId, (int) $prod['id'], $prod['name'], $optionsText, $unit, $qty, $unit * $qty]);
    } elseif ($action === 'setItemOptions') {
        /* Cambiar las opciones de una línea ya cargada (ej: le erraron a las papas).
           Se recalcula el precio desde el producto: nunca desde lo que había. */
        $itemId = (int) ($in['itemId'] ?? 0);
        $it = $pdo->prepare('SELECT id, product_id, qty FROM order_items WHERE id = ? AND order_id = ?');
        $it->execute([$itemId, $orderId]);
        $item = $it->fetch();
        if (!$item) {
            $pdo->rollBack();
            json_out(['error' => 'Ese ítem no es de este pedido.'], 404);
        }
        if (!$item['product_id']) {
            $pdo->rollBack();
            json_out(['error' => 'Ese ítem ya no está en el menú: quitalo y agregalo de nuevo.'], 422);
        }

        $p = $pdo->prepare('SELECT id, name, price, category FROM products WHERE id = ?');
        $p->execute([(int) $item['product_id']]);
        $prod = $p->fetch();
        if (!$prod) {
            $pdo->rollBack();
            json_out(['error' => 'Ese producto ya no existe: quitalo y agregá otro.'], 422);
        }

        $setKey   = byr_option_set_for_category($prod['category']) ?? 'staff';
        $selected = is_array($in['options'] ?? null) ? $in['options'] : [];
        $opt      = byr_resolve_options($setKey, $selected);
        if (!$opt['ok']) {
            $pdo->rollBack();
            json_out(['error' => $opt['error'], 'code' => 'option-invalid'], 422);
        }

        $optionsText = byr_edit_options_text($opt['text'], $in['note'] ?? '');
        $unit        = (int) $prod['price'] + (int) $opt['delta'];
        $qty         = (int) $item['qty'];
        $pdo->prepare('UPDATE order_items SET options = ?, unit_price = ?, subtotal = ? WHERE id = ?')
            ->execute([$optionsText, $unit, $unit * $qty, $itemId]);
    } elseif ($action === 'setItemQty') {
        $itemId = (int) ($in['itemId'] ?? 0);
        $qty    = min((int) ($in['qty'] ?? 0), 50);
        $it = $pdo->prepare('SELECT id, unit_price FROM order_items WHERE id = ? AND order_id = ?');
        $it->execute([$itemId, $orderId]);
        $item = $it->fetch();
        if (!$item) {
            $pdo->rollBack();
            json_out(['error' => 'Ese ítem no es de este pedido.'], 404);
        }
        if ($qty <= 0) {
            $pdo->prepare('DELETE FROM order_items WHERE id = ?')->execute([$itemId]);
        } else {
            $sub = (int) $item['unit_price'] * $qty;
            $pdo->prepare('UPDATE order_items SET qty = ?, subtotal = ? WHERE id = ?')->execute([$qty, $sub, $itemId]);
        }
    } else {
        $pdo->rollBack();
        json_out(['error' => 'Acción inválida.'], 422);
    }

    /* Recalcular total y puntos sugeridos del pedido. */
    $tot = $pdo->prepare('SELECT COALESCE(SUM(subtotal), 0) AS t FROM order_items WHERE order_id = ?');
    $tot->execute([$orderId]);
    $itemsTotal = (int) $tot->fetch()['t'];

    $rate = (int) byr_setting('order_points_per_amount', 100);
    if ($rate < 1) {
        $rate = 100;
    }
    $pointsSuggested = intdiv($itemsTotal, $rate);

    $pdo->prepare('UPDATE orders SET items_total = ?, points_suggested = ? WHERE id = ?')
        ->execute([$itemsTotal, $pointsSuggested, $orderId]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out(['error' => 'No se pudo editar el pedido. Probá de nuevo.'], 500);
}

json_out(['ok' => true, 'orderId' => $orderId, 'itemsTotal' => $itemsTotal, 'pointsSuggested' => $pointsSuggested]);
