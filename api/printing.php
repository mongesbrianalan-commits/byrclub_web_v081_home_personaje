<?php
/**
 * Impresión térmica (POS Fase 2). Incluir DESPUÉS de helpers.php.
 *
 * El server NO le habla a la impresora: renderiza el ticket en ESC/POS y lo
 * deja en la cola `print_jobs`. Un agente que corre en la PC del local (ver
 * tools/print-agent/) va a buscar los trabajos y los manda por TCP 9100.
 *
 * Que el ESC/POS se arme ACÁ y no en el agente es a propósito: para cambiar
 * cómo sale una comanda se toca este archivo y listo, sin pisar la PC del local.
 *
 * Todo degrada con gracia: si no está corrida la migración 2026-08-print-jobs.sql,
 * encolar no hace nada y devuelve null. Nunca rompe una venta por la impresora.
 *
 * OJO con el orden: primero se pasa el texto a CP437 (byr_t) y RECIÉN AHÍ se
 * mide/corta/alinea. Si se hace al revés, un acento o un emoji cuenta como
 * varios bytes y se desalinean los importes.
 */

/* --- Ancho del papel: 80mm con Font A = 48 columnas ---------------------- */
const BYR_PRINT_COLS = 48;

/* --- Bytes ESC/POS que usamos ------------------------------------------- */
const BYR_ESC = "\x1B";
const BYR_GS  = "\x1D";

/**
 * ¿Está corrida la migración de impresión? Cachea el resultado.
 */
function byr_print_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW TABLES LIKE 'print_jobs'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * A qué estación va cada tipo de impresión. Con una sola impresora, todas
 * apuntan a 'cocina' y no hay nada que configurar. Si algún día hay una
 * segunda térmica en la caja, se agrega en config.php:
 *   'print_station_ticket' => 'caja',
 *   'print_station_report' => 'caja',
 */
function byr_print_station(string $kind): string
{
    $keys = [
        'ticket' => 'print_station_ticket',
        'report' => 'print_station_report',
    ];
    $key = $keys[$kind] ?? 'print_station_comanda';
    $st  = trim((string) byr_setting($key, 'cocina'));
    return $st !== '' ? substr($st, 0, 30) : 'cocina';
}

/**
 * Qué se imprime SOLO al cobrar/confirmar, sin que nadie apriete nada.
 * Por defecto solo la comanda: en un local con una sola impresora, sacar
 * también el ticket del cliente en cada venta es desperdiciar papel (el
 * ticket sigue estando a un botón de distancia en el panel).
 * Se cambia en config.php:  'print_auto' => ['comanda', 'ticket'],
 */
function byr_print_auto(): array
{
    $v = byr_setting('print_auto', ['comanda']);
    if (is_string($v)) {
        $v = $v === '' ? [] : [$v];
    }
    return is_array($v) ? $v : ['comanda'];
}

/* =========================================================
   Texto → CP437 (la tabla de caracteres de las térmicas)
========================================================= */

/**
 * Pasa UTF-8 a CP437, que es lo que entienden las térmicas por defecto.
 * CP437 tiene las minúsculas acentuadas y la ñ, pero NO las mayúsculas
 * acentuadas: esas caen a su letra pelada. Lo que no entra (emojis, sobre
 * todo, que el panel mete en las opciones) se descarta antes del papel.
 *
 * Devuelve una cadena de UN byte por carácter: recién ahí se puede medir el
 * ancho con strlen() y alinear a 48 columnas.
 */
function byr_t($s): string
{
    static $map = [
        'á' => "\xA0", 'í' => "\xA1", 'ó' => "\xA2", 'ú' => "\xA3", 'é' => "\x82",
        'ñ' => "\xA4", 'Ñ' => "\xA5", 'ü' => "\x81", 'Ü' => "\x9A", 'ç' => "\x87",
        'à' => "\x85", 'è' => "\x8A", 'ì' => "\x8D", 'ò' => "\x95", 'ù' => "\x97",
        'â' => "\x83", 'ê' => "\x88", 'î' => "\x8C", 'ô' => "\x93", 'û' => "\x96",
        'ä' => "\x84", 'ë' => "\x89", 'ï' => "\x8B", 'ö' => "\x94",
        '¿' => "\xA8", '¡' => "\xAD", '°' => "\xF8", '·' => "\xFA",
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U',
        '“' => '"', '”' => '"', '‘' => "'", '’' => "'",
        '–' => '-', '—' => '-', '…' => '...', '€' => 'EUR',
    ];

    $s = (string) $s;
    $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
    if ($chars === false) {
        /* No era UTF-8 válido: dejamos solo ASCII imprimible. */
        return preg_replace('/[^\x0A\x20-\x7E]/', '', $s);
    }

    $out = '';
    foreach ($chars as $ch) {
        if (isset($map[$ch])) {
            $out .= $map[$ch];
            continue;
        }
        if (strlen($ch) === 1) {
            $o = ord($ch);
            if ($o === 0x0A || ($o >= 0x20 && $o <= 0x7E)) {
                $out .= $ch;
            }
            continue;
        }
        /* Multibyte sin mapear (emoji, símbolo raro): se descarta. */
    }
    return $out;
}

/**
 * Corta una línea al ancho del papel, respetando palabras.
 * Recibe texto YA pasado por byr_t().
 */
function byr_print_wrap(string $s, int $cols = BYR_PRINT_COLS, string $indent = ''): string
{
    $s = trim(preg_replace('/\s+/', ' ', $s));
    if ($s === '') {
        return '';
    }
    $width   = max(8, $cols - strlen($indent));
    $wrapped = wordwrap($s, $width, "\n", true);
    return $indent . str_replace("\n", "\n" . $indent, $wrapped) . "\n";
}

/**
 * Línea de dos columnas: texto a la izquierda, importe pegado a la derecha.
 * Recibe texto YA pasado por byr_t().
 */
function byr_print_row(string $left, string $right, int $cols = BYR_PRINT_COLS): string
{
    $right = trim($right);
    $left  = trim(preg_replace('/\s+/', ' ', $left));
    $room  = $cols - strlen($right) - 1;
    if ($room < 4) {
        return $left . "\n" . str_pad($right, $cols, ' ', STR_PAD_LEFT) . "\n";
    }
    if (strlen($left) > $room) {
        $left = substr($left, 0, $room - 1) . '.';
    }
    return str_pad($left, $cols - strlen($right)) . $right . "\n";
}

function byr_print_rule(string $ch = '-'): string
{
    return str_repeat($ch, BYR_PRINT_COLS) . "\n";
}

function byr_print_money($n): string
{
    return '$' . number_format((int) $n, 0, ',', '.');
}

/* =========================================================
   Renderers
========================================================= */

/**
 * Comanda de cocina: grande, sin precios. Lo único que importa es qué cocinar
 * y las aclaraciones ("sin cebolla"), así que los ítems van en doble tamaño
 * (por eso se cortan a 24 columnas: en doble ancho entra la mitad).
 */
function byr_escpos_comanda(array $o): string
{
    $b  = BYR_ESC . '@';            // reset
    $b .= BYR_ESC . 't' . "\x00";   // tabla de caracteres CP437

    $b .= BYR_ESC . 'a' . "\x01";   // centrado
    $b .= BYR_GS . '!' . "\x11";    // doble alto y ancho
    $b .= byr_t('COMANDA') . "\n";
    $b .= BYR_GS . '!' . "\x01";    // doble alto
    $b .= byr_t('Pedido #' . $o['id']) . "\n";
    $b .= BYR_GS . '!' . "\x00";    // tamaño normal
    $b .= byr_t(byr_print_fulfill($o) . '  ' . byr_print_when($o)) . "\n";

    $b .= BYR_ESC . 'a' . "\x00";   // izquierda
    $b .= byr_print_rule('=');

    if (!empty($o['customerName'])) {
        $b .= BYR_ESC . 'E' . "\x01"
            . byr_print_wrap(byr_t($o['customerName']))
            . BYR_ESC . 'E' . "\x00";
    }
    if (($o['fulfillment'] ?? '') === 'delivery' && !empty($o['address'])) {
        $b .= byr_print_wrap(byr_t($o['address']));
    }
    if (!empty($o['customerPhone'])) {
        $b .= byr_print_wrap(byr_t('Tel: ' . $o['customerPhone']));
    }

    /* Cómo dijo que paga. Va en la comanda porque es la hoja que viaja con el
       pedido: el que reparte tiene que saber si sale con cambio o no. */
    if (!empty($o['paymentPref'])) {
        $total = (int) ($o['itemsTotal'] ?? 0) + (int) ($o['shippingCost'] ?? 0);
        $b .= BYR_ESC . 'E' . "\x01";
        $b .= byr_print_wrap(byr_t('PAGA: ' . strtoupper($o['paymentPref'])
            . ' - ' . byr_print_money($total)));
        $hint = (int) ($o['cashHint'] ?? 0);
        if ($o['paymentPref'] === 'efectivo' && $hint > 0) {
            $b .= byr_print_wrap(byr_t('Abona con ' . byr_print_money($hint)
                . ($hint >= $total ? ' - vuelto ' . byr_print_money($hint - $total) : '')));
        }
        $b .= BYR_ESC . 'E' . "\x00";
    }

    /* Mostrador: el cliente ya pagó en la caja. Si esto sale en moto hay que
       decirlo, o el que reparte le cobra de nuevo a alguien que ya pagó. */
    if (($o['channel'] ?? '') === 'mostrador' && ($o['fulfillment'] ?? '') === 'delivery') {
        $total = (int) ($o['itemsTotal'] ?? 0) + (int) ($o['shippingCost'] ?? 0);
        $b .= BYR_ESC . 'E' . "\x01";
        $b .= byr_print_wrap(byr_t('YA PAGO EN EL LOCAL - ' . byr_print_money($total)
            . ' - NO COBRAR'));
        $b .= BYR_ESC . 'E' . "\x00";
    }

    $b .= byr_print_rule();

    foreach (($o['items'] ?? []) as $ln) {
        /* El ítem en doble alto: se lee desde la plancha sin agacharse. */
        $b .= BYR_GS . '!' . "\x01";
        $b .= byr_print_wrap(byr_t($ln['qty'] . ' x ' . $ln['name']), 24);
        $b .= BYR_GS . '!' . "\x00";
        if (!empty($ln['options'])) {
            $b .= BYR_ESC . 'E' . "\x01";
            $b .= byr_print_wrap(byr_t($ln['options']), BYR_PRINT_COLS, '   ');
            $b .= BYR_ESC . 'E' . "\x00";
        }
        $b .= "\n";
    }

    if (!empty($o['notes'])) {
        $b .= byr_print_rule();
        $b .= BYR_ESC . 'E' . "\x01";
        $b .= byr_print_wrap(byr_t('NOTA: ' . $o['notes']));
        $b .= BYR_ESC . 'E' . "\x00";
    }
    if (!empty($o['couponLabel'])) {
        $b .= byr_print_rule();
        $b .= BYR_ESC . 'E' . "\x01";
        $b .= byr_print_wrap(byr_t('CUPON: ' . $o['couponLabel']));
        $b .= BYR_ESC . 'E' . "\x00";
    }

    return $b . byr_print_cut();
}

/**
 * Ticket del cliente: con precios y total. No es fiscal y lo dice.
 */
function byr_escpos_ticket(array $o): string
{
    $b  = BYR_ESC . '@';
    $b .= BYR_ESC . 't' . "\x00";

    $b .= BYR_ESC . 'a' . "\x01";
    $b .= BYR_GS . '!' . "\x11";
    $b .= byr_t('BYR DOCKSUD') . "\n";
    $b .= BYR_GS . '!' . "\x00";
    $b .= byr_t('Hamburguesería - Dock Sud') . "\n";
    $b .= byr_t('Comprobante no fiscal') . "\n";

    $b .= BYR_ESC . 'a' . "\x00";
    $b .= byr_print_rule();
    $b .= byr_print_row(byr_t('Pedido #' . $o['id']), byr_t(byr_print_when($o)));
    $b .= byr_print_wrap(byr_t(byr_print_fulfill($o)
        . (!empty($o['customerName']) ? ' - ' . $o['customerName'] : '')));
    $b .= byr_print_rule();

    foreach (($o['items'] ?? []) as $ln) {
        $b .= byr_print_row(byr_t($ln['qty'] . ' x ' . $ln['name']), byr_print_money($ln['subtotal']));
        if (!empty($ln['options'])) {
            $b .= byr_print_wrap(byr_t($ln['options']), BYR_PRINT_COLS, '   ');
        }
    }

    $b .= byr_print_rule();
    /* El envío es aparte de la comida: si lo hubo, va como renglón propio. */
    $shipping = (int) ($o['shippingCost'] ?? 0);
    if ($shipping > 0) {
        $b .= byr_print_row(byr_t('Subtotal'), byr_print_money($o['itemsTotal'] ?? 0));
        $b .= byr_print_row(byr_t('Envío'), byr_print_money($shipping));
    }
    $b .= BYR_GS . '!' . "\x01";
    /* En doble ancho el renglón mide 24 columnas, no 48. */
    $b .= byr_print_row(byr_t('TOTAL'), byr_print_money((int) ($o['itemsTotal'] ?? 0) + $shipping), 24);
    $b .= BYR_GS . '!' . "\x00";

    if (!empty($o['paymentMethod'])) {
        $labels = ['efectivo' => 'Efectivo', 'debito' => 'Débito', 'credito' => 'Crédito',
                   'qr' => 'QR', 'transfer' => 'Transferencia'];
        $b .= byr_print_row(byr_t('Pago'), byr_t($labels[$o['paymentMethod']] ?? $o['paymentMethod']));
    }
    if (!empty($o['pointsAwarded'])) {
        $b .= byr_print_rule();
        $b .= BYR_ESC . 'a' . "\x01";
        $b .= byr_t('Sumaste ' . (int) $o['pointsAwarded'] . ' puntos BYR Club') . "\n";
        $b .= BYR_ESC . 'a' . "\x00";
    }

    $b .= byr_print_rule();
    $b .= BYR_ESC . 'a' . "\x01";
    $b .= byr_t('¡Gracias por tu compra!') . "\n";
    $b .= byr_t('byrclub.com') . "\n";

    return $b . byr_print_cut();
}

/**
 * Cierre de caja (reporte Z). No lleva ítems ni pedidos: es el resumen del
 * turno, con las ventas por medio de pago y el arqueo del efectivo.
 *
 * Recibe el `$z` que arma byr_print_load_cierre() leyendo la base, con la misma
 * forma que devuelve caja-close.php pero además con closedAt y quién abrió y
 * cerró, que en el papel importan y en la pantalla no estaban.
 *
 * Los números que el cajero busca de un vistazo (total vendido, efectivo
 * esperado y diferencia) van en doble ancho, que son 24 columnas y no 48.
 */
function byr_escpos_cierre(array $z): string
{
    $t  = $z['totals'] ?? [];
    $by = $t['byMethod'] ?? [];

    /* Mismos nombres que usa el ticket, para no tener dos vocabularios. */
    $labels = ['efectivo' => 'Efectivo', 'debito' => 'Débito', 'credito' => 'Crédito',
               'qr' => 'QR', 'transfer' => 'Transferencia'];

    $b  = BYR_ESC . '@';
    $b .= BYR_ESC . 't' . "\x00";

    $b .= BYR_ESC . 'a' . "\x01";
    $b .= BYR_GS . '!' . "\x11" . byr_t('BYR DOCKSUD') . "\n" . BYR_GS . '!' . "\x00";
    $b .= BYR_GS . '!' . "\x01" . byr_t('CIERRE DE CAJA') . "\n" . BYR_GS . '!' . "\x00";
    $b .= byr_t('Turno #' . (int) ($z['sessionId'] ?? 0)) . "\n";
    $b .= byr_t('Reporte Z - no fiscal') . "\n";

    $b .= BYR_ESC . 'a' . "\x00";
    $b .= byr_print_rule();
    $b .= byr_print_row(byr_t('Apertura'), byr_t(byr_dt_label($z['openedAt'] ?? null) ?? '-'));
    $b .= byr_print_row(byr_t('Cierre'), byr_t(byr_dt_label($z['closedAt'] ?? null) ?? date('d/m H:i')));
    if (!empty($z['openedBy'])) {
        $b .= byr_print_row(byr_t('Abrió'), byr_t($z['openedBy']));
    }
    if (!empty($z['closedBy'])) {
        $b .= byr_print_row(byr_t('Cerró'), byr_t($z['closedBy']));
    }

    /* Los cinco medios van siempre, incluso en cero: este papel se archiva, y
       un renglón ausente deja la duda de si se controló o no. */
    $b .= byr_print_rule();
    $b .= byr_t('VENTAS POR MEDIO DE PAGO') . "\n";
    foreach ($labels as $k => $lbl) {
        $b .= byr_print_row(byr_t($lbl), byr_print_money($by[$k] ?? 0));
    }
    $b .= byr_print_rule();
    /* \x11 es doble alto Y ancho (ver la comanda): recién ahí el renglón mide
       24 columnas en vez de 48. Con \x01 (solo doble alto) el importe quedaría
       clavado a mitad del papel. */
    $b .= BYR_GS . '!' . "\x11";
    $b .= byr_print_row(byr_t('TOTAL'), byr_print_money($t['salesTotal'] ?? 0), 24);
    $b .= BYR_GS . '!' . "\x00";
    $b .= byr_print_row(byr_t('Operaciones'), byr_t((string) (int) ($t['paymentsCount'] ?? 0)));

    /* Arqueo: lo que tiene que haber en el cajón, desglosado para poder
       rastrear una diferencia sin abrir el panel. */
    $b .= byr_print_rule();
    $b .= byr_t('EFECTIVO EN CAJA') . "\n";
    $b .= byr_print_row(byr_t('Fondo inicial'), byr_print_money($z['openingFloat'] ?? 0));
    $b .= byr_print_row(byr_t('Ventas en efectivo'), byr_print_money($by['efectivo'] ?? 0));
    $b .= byr_print_row(byr_t('Ingresos'), byr_print_money($t['cashIn'] ?? 0));
    $b .= byr_print_row(byr_t('Egresos'), byr_t('-' . byr_print_money($t['cashOut'] ?? 0)));
    $b .= byr_print_rule();
    $b .= BYR_GS . '!' . "\x11";
    $b .= byr_print_row(byr_t('ESPERADO'), byr_print_money($z['expectedCash'] ?? 0), 24);
    $b .= BYR_GS . '!' . "\x00";

    if (($z['countedCash'] ?? null) === null) {
        /* Se puede cerrar sin contar la plata: el papel lo tiene que decir, si
           no parece un arqueo que dio perfecto. */
        $b .= byr_print_row(byr_t('Contado'), byr_t('sin arqueo'));
    } else {
        $d = (int) ($z['difference'] ?? 0);
        $b .= byr_print_row(byr_t('Contado'), byr_print_money($z['countedCash']));
        $b .= BYR_GS . '!' . "\x11";
        $b .= byr_print_row(
            byr_t('DIFERENCIA'),
            byr_t($d < 0 ? '-' . byr_print_money(-$d) : byr_print_money($d)),
            24
        );
        $b .= BYR_GS . '!' . "\x00";
        $b .= BYR_ESC . 'a' . "\x01";
        $b .= byr_t($d === 0 ? 'SIN DIFERENCIA' : ($d > 0 ? 'SOBRA EN CAJA' : 'FALTA EN CAJA')) . "\n";
        $b .= BYR_ESC . 'a' . "\x00";
    }

    $b .= byr_print_rule();
    $b .= BYR_ESC . 'a' . "\x01";
    $b .= byr_t('Impreso ' . date('d/m/Y H:i')) . "\n";
    $b .= byr_t('Firma: ______________________') . "\n";

    return $b . byr_print_cut();
}

/** Prueba de impresora (la que dispara el botón "Probar impresora"). */
function byr_escpos_test(): string
{
    $b  = BYR_ESC . '@' . BYR_ESC . 't' . "\x00";
    $b .= BYR_ESC . 'a' . "\x01";
    $b .= BYR_GS . '!' . "\x11" . byr_t('BYR CLUB') . "\n" . BYR_GS . '!' . "\x00";
    $b .= byr_t('Prueba de impresión') . "\n";
    $b .= byr_t(date('d/m/Y H:i')) . "\n";
    $b .= BYR_ESC . 'a' . "\x00" . byr_print_rule();
    $b .= byr_print_wrap(byr_t('Acentos: canción, jalapeño, ñandú, ¡olé!'));
    $b .= byr_print_row(byr_t('1 x Doble con Cheddar'), byr_print_money(16000));
    $b .= byr_print_wrap(byr_t('Papas: individual · 📝 sin cebolla'), BYR_PRINT_COLS, '   ');
    $b .= byr_print_rule();
    $b .= byr_print_row(byr_t('TOTAL'), byr_print_money(16000));
    return $b . byr_print_cut();
}

function byr_print_cut(): string
{
    /* Tres saltos para que el corte no se coma la última línea, y corte parcial. */
    return "\n\n\n" . BYR_GS . 'V' . "\x42" . "\x00";
}

function byr_print_fulfill(array $o): string
{
    $isDelivery = ($o['fulfillment'] ?? 'pickup') === 'delivery';

    /* Una venta de mostrador también puede salir en moto: el que la prepara
       tiene que ver DELIVERY, si no la deja en la barra esperando a alguien
       que no va a venir a buscarla. */
    if (($o['channel'] ?? '') === 'mostrador') {
        return $isDelivery ? 'MOSTRADOR - DELIVERY' : 'MOSTRADOR';
    }
    return $isDelivery ? 'DELIVERY' : 'RETIRO';
}

function byr_print_when(array $o): string
{
    /* La fecha viene del reloj de la base (UTC): hay que pasarla a hora de
       Argentina o la comanda sale con 3 horas de más. */
    return byr_dt_label($o['createdAt'] ?? null) ?? date('d/m H:i');
}

/* =========================================================
   Cola
========================================================= */

/**
 * Arma el objeto del pedido (cabecera + ítems) tal como lo esperan los
 * renderers. Devuelve null si el pedido no existe.
 */
function byr_print_load_order(PDO $pdo, int $orderId): ?array
{
    $ship = byr_shipping_ready($pdo) ? 'shipping_cost' : '0 AS shipping_cost';
    $pay  = byr_payment_pref_ready($pdo)
        ? 'payment_pref, cash_hint'
        : 'NULL AS payment_pref, NULL AS cash_hint';
    $cols = "id, user_id, status, fulfillment, customer_name, customer_phone, address, notes,
             items_total, $ship, $pay, points_awarded, coupon_label, created_at";
    try {
        $stmt = $pdo->prepare("SELECT $cols, channel FROM orders WHERE id = ?");
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        /* Sin la migración de mostrador no existe `channel`. */
        $stmt = $pdo->prepare("SELECT $cols FROM orders WHERE id = ?");
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
    }
    if (!$row) {
        return null;
    }

    $it = $pdo->prepare('SELECT name, options, qty, subtotal FROM order_items WHERE order_id = ? ORDER BY id');
    $it->execute([$orderId]);
    $items = [];
    foreach ($it->fetchAll() as $ln) {
        $items[] = [
            'qty'      => (int) $ln['qty'],
            'name'     => $ln['name'],
            'options'  => $ln['options'],
            'subtotal' => (int) $ln['subtotal'],
        ];
    }

    /* El medio de pago sale de `payments` (puede no existir la tabla todavía). */
    $method = null;
    try {
        $p = $pdo->prepare('SELECT method FROM payments WHERE order_id = ? ORDER BY id LIMIT 1');
        $p->execute([$orderId]);
        $prow   = $p->fetch();
        $method = $prow ? $prow['method'] : null;
    } catch (Throwable $e) {
        /* sin caja: el ticket sale sin la línea de pago */
    }

    return [
        'id'            => (int) $row['id'],
        'status'        => $row['status'],
        'channel'       => $row['channel'] ?? 'online',
        'fulfillment'   => $row['fulfillment'],
        'customerName'  => $row['customer_name'],
        'customerPhone' => $row['customer_phone'],
        'address'       => $row['address'],
        'notes'         => $row['notes'],
        'couponLabel'   => $row['coupon_label'],
        'itemsTotal'    => (int) $row['items_total'],
        'shippingCost'  => (int) $row['shipping_cost'],
        'paymentPref'   => $row['payment_pref'],
        'cashHint'      => $row['cash_hint'] !== null ? (int) $row['cash_hint'] : null,
        'pointsAwarded' => $row['points_awarded'] !== null ? (int) $row['points_awarded'] : null,
        'paymentMethod' => $method,
        'createdAt'     => $row['created_at'],
        'items'         => $items,
    ];
}

/**
 * Arma el cierre de un turno leyéndolo de la base, con la misma forma que
 * devuelve caja-close.php. Devuelve null si no existe el turno o si todavía
 * no se corrió la migración de caja.
 *
 * Que el papel se arme desde la base y no desde lo que tenía a mano el que
 * cierra es a propósito: una reimpresión días después tiene que dar idéntico.
 */
function byr_print_load_cierre(PDO $pdo, int $sessionId): ?array
{
    require_once __DIR__ . '/caja.php';
    try {
        $st = $pdo->prepare(
            'SELECT s.id, s.opened_at, s.closed_at, s.opening_float,
                    s.expected_cash, s.counted_cash, s.difference,
                    uo.name AS opened_by_name, uc.name AS closed_by_name
               FROM cash_sessions s
               LEFT JOIN users uo ON uo.id = s.opened_by
               LEFT JOIN users uc ON uc.id = s.closed_by
              WHERE s.id = ?'
        );
        $st->execute([$sessionId]);
        $row = $st->fetch();
    } catch (Throwable $e) {
        /* Sin 2026-08-caja.sql no hay `cash_sessions`: no hay nada que imprimir. */
        return null;
    }
    if (!$row) {
        return null;
    }

    $totals = byr_session_totals($pdo, $sessionId, (int) $row['opening_float']);

    return [
        'sessionId'    => (int) $row['id'],
        'openedAt'     => $row['opened_at'],
        'closedAt'     => $row['closed_at'],
        'openedBy'     => $row['opened_by_name'],
        'closedBy'     => $row['closed_by_name'],
        'openingFloat' => (int) $row['opening_float'],
        /* Un turno todavía abierto no tiene `expected_cash` guardado: ahí vale
           el calculado en vivo (es el caso de un Z de prueba). */
        'expectedCash' => $row['expected_cash'] === null
            ? (int) $totals['expectedCash']
            : (int) $row['expected_cash'],
        'countedCash'  => $row['counted_cash'] === null ? null : (int) $row['counted_cash'],
        'difference'   => $row['difference'] === null ? null : (int) $row['difference'],
        'totals'       => $totals,
    ];
}

/**
 * Encola una impresión. Devuelve el id del trabajo, o null si no se pudo
 * (falta la migración, no existe el pedido, etc.).
 *
 * Para `report` el que manda es $sessionId (el turno de caja), no $orderId:
 * un cierre no cuelga de ningún pedido.
 *
 * NUNCA lanza: cobrar una venta no puede fallar porque la impresora tenga
 * algún problema. El que llama decide si le avisa al cajero.
 */
function byr_print_enqueue(
    PDO $pdo,
    string $kind,
    ?int $orderId = null,
    ?int $createdBy = null,
    ?int $sessionId = null
): ?int {
    if (!byr_print_ready($pdo)) {
        return null;
    }
    try {
        if ($kind === 'test') {
            $payload = byr_escpos_test();
            $orderId = null;
        } elseif ($kind === 'report') {
            if (!$sessionId) {
                return null;
            }
            $z = byr_print_load_cierre($pdo, $sessionId);
            if (!$z) {
                return null;
            }
            $payload = byr_escpos_cierre($z);
            $orderId = null;
        } else {
            if (!$orderId) {
                return null;
            }
            $order = byr_print_load_order($pdo, $orderId);
            if (!$order) {
                return null;
            }
            $kind    = $kind === 'ticket' ? 'ticket' : 'comanda';
            $payload = $kind === 'ticket' ? byr_escpos_ticket($order) : byr_escpos_comanda($order);
        }

        $ins = $pdo->prepare(
            'INSERT INTO print_jobs (station, order_id, kind, payload, created_by)
             VALUES (?, ?, ?, ?, ?)'
        );
        $ins->execute([byr_print_station($kind), $orderId, $kind, base64_encode($payload), $createdBy]);
        return (int) $pdo->lastInsertId();
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Autentica al agente del local. No hay sesión de navegador acá: usa un token
 * compartido que se guarda en config.php ('print_token'). Sin token
 * configurado, la cola queda cerrada.
 */
function byr_print_require_token(): void
{
    $expected = (string) byr_setting('print_token', '');
    if ($expected === '') {
        json_out(['error' => 'La impresión no está configurada (falta print_token en config.php).',
                  'code'  => 'no-token'], 503);
    }
    $sent = (string) ($_SERVER['HTTP_X_BYR_PRINT_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals($expected, $sent)) {
        json_out(['error' => 'Token de impresión inválido.'], 401);
    }
}
