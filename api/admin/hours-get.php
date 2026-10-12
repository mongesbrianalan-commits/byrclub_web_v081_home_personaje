<?php
/**
 * ADMIN — Días y horarios para pedir por la web, para el editor del panel
 * (Menú → Días y horarios). Solo admin.
 *
 * Respuesta: {
 *   ok, ready,            ready = false si falta 2026-10-store-hours.sql
 *   source,               'panel' (guardado desde acá) | 'config' (config.php)
 *   updatedAt,
 *   week:     { "1": null | {open, close}, … "7": … },
 *   closures: [ {date, reason}, … ]   (solo de hoy en adelante)
 *   now:      lo que ve el cliente en este momento (byr_orders_window)
 * }
 */
require_once __DIR__ . '/../helpers.php';

$pdo = db();
require_admin($pdo);

$hours = byr_opening_hours($pdo);
$hoy   = (new DateTimeImmutable('now', new DateTimeZone(BYR_TZ)))->format('Y-m-d');

/* Los cierres que ya pasaron no se muestran: no sirven para nada y
   ensucian la lista. Se borran solos la próxima vez que se guarde. */
$closures = array_values(array_filter($hours['closures'], fn($c) => $c['date'] >= $hoy));

json_out([
    'ok'        => true,
    'ready'     => byr_store_settings_ready($pdo),
    'source'    => $hours['source'],
    'updatedAt' => $hours['updatedAt'],
    'week'      => (object) $hours['week'],
    'closures'  => $closures,
    'today'     => $hoy,
    'now'       => byr_window_at($hours, new DateTimeImmutable('now', new DateTimeZone(BYR_TZ))),
]);
