<?php
/**
 * Helpers de caja (POS Fase 1). Incluir DESPUÉS de helpers.php.
 *
 * Toda la plata en enteros ($ sin centavos). Por ahora hay una sola caja:
 * a lo sumo una sesión con status 'open'.
 */

/** Medios de pago válidos (deben coincidir con el ENUM de `payments`). */
function byr_payment_methods(): array
{
    return ['efectivo', 'debito', 'credito', 'qr', 'transfer'];
}

/**
 * ¿Está corrida la migración de caja? Sirve para degradar con gracia mientras
 * el dueño no corrió 2026-08-caja.sql en phpMyAdmin: así el confirmar de
 * pedidos nunca se rompe por falta de la tabla `payments`. Cachea el resultado.
 */
function byr_caja_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW TABLES LIKE 'payments'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/**
 * ¿Está corrida la migración de venta de mostrador (2026-08-pos-sale.sql)?
 * Se detecta por la columna `orders.channel`. Cachea el resultado.
 */
function byr_pos_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW COLUMNS FROM orders LIKE 'channel'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/** Devuelve la sesión de caja abierta (fila completa) o null si no hay ninguna. */
function byr_open_session(PDO $pdo): ?array
{
    $row = $pdo->query(
        "SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1"
    )->fetch();
    return $row ?: null;
}

/**
 * Totales en vivo de una sesión: ventas por medio de pago, movimientos de
 * efectivo y efectivo esperado en caja.
 *
 * Efectivo esperado = fondo inicial + ventas en efectivo + ingresos - egresos.
 */
function byr_session_totals(PDO $pdo, int $sessionId, int $openingFloat): array
{
    $byMethod = array_fill_keys(byr_payment_methods(), 0);

    $p = $pdo->prepare(
        'SELECT method, SUM(amount) AS total, COUNT(*) AS n
           FROM payments WHERE session_id = ? GROUP BY method'
    );
    $p->execute([$sessionId]);
    $count = 0;
    foreach ($p->fetchAll() as $r) {
        if (isset($byMethod[$r['method']])) {
            $byMethod[$r['method']] = (int) $r['total'];
        }
        $count += (int) $r['n'];
    }
    $salesTotal = array_sum($byMethod);

    $m = $pdo->prepare(
        'SELECT type, SUM(amount) AS total FROM cash_movements WHERE session_id = ? GROUP BY type'
    );
    $m->execute([$sessionId]);
    $cashIn = 0;
    $cashOut = 0;
    foreach ($m->fetchAll() as $r) {
        if ($r['type'] === 'in') {
            $cashIn = (int) $r['total'];
        } else {
            $cashOut = (int) $r['total'];
        }
    }

    $expectedCash = $openingFloat + $byMethod['efectivo'] + $cashIn - $cashOut;

    return [
        'byMethod'      => $byMethod,
        'salesTotal'    => $salesTotal,
        'paymentsCount' => $count,
        'cashIn'        => $cashIn,
        'cashOut'       => $cashOut,
        'expectedCash'  => $expectedCash,
    ];
}
