<?php
/**
 * ADMIN — Guarda los días y horarios para pedir por la web. Solo admin.
 *
 * Tiene efecto al instante: la carta (api/menu.php) y la creación del pedido
 * (api/orders/create.php) leen lo que se guarda acá. Desde que se guarda una
 * vez, lo de config.php ('order_hours', 'order_closed_weekdays',
 * 'order_closed_dates') deja de usarse.
 *
 * Body JSON:
 *   week:     { "1": null | {open: "HH:MM", close: "HH:MM"}, … "7": … }
 *             null = ese día no se toman pedidos. Si el cierre es más
 *             temprano que la apertura, el turno cruza la medianoche.
 *   closures: [ {date: "YYYY-MM-DD", reason: "por …"} ]
 *             Cierres de un día puntual. El motivo completa la frase
 *             "Hoy no estamos tomando pedidos <motivo>."
 *
 * Respuesta: lo mismo que hours-get.php.
 */
require_once __DIR__ . '/../helpers.php';
require_method('POST');

$pdo     = db();
$adminId = require_admin($pdo);

if (!byr_store_settings_ready($pdo)) {
    json_out([
        'error' => 'Todavía no se puede guardar el horario desde el panel. (Falta correr 2026-10-store-hours.sql.)',
        'code'  => 'hours-not-ready',
    ], 503);
}

$in = body_json();

/* --- Validar la semana día por día, con un mensaje que diga cuál está mal.
       byr_hours_normalize descartaría en silencio una hora rota y dejaría el
       día cerrado: acá es mejor avisar. --- */
$weekIn = is_array($in['week'] ?? null) ? $in['week'] : null;
if ($weekIn === null) {
    json_out(['error' => 'Falta el horario de la semana.'], 422);
}

$week = [];
for ($d = 1; $d <= 7; $d++) {
    $day    = $weekIn[$d] ?? $weekIn[(string) $d] ?? null;
    $nombre = ucfirst(BYR_WEEKDAY_NAMES[$d]);

    if ($day === null || $day === false) {
        $week[$d] = null;
        continue;
    }
    $open  = is_array($day) ? byr_clean_hhmm($day['open'] ?? '')  : null;
    $close = is_array($day) ? byr_clean_hhmm($day['close'] ?? '') : null;
    if ($open === null || $close === null) {
        json_out(['error' => "$nombre: completá la hora de apertura y la de cierre."], 422);
    }
    if ($open === $close) {
        json_out(['error' => "$nombre: la apertura y el cierre no pueden ser la misma hora."], 422);
    }
    $week[$d] = ['open' => $open, 'close' => $close];
}

/* --- Cierres puntuales --- */
$hoy      = (new DateTimeImmutable('now', new DateTimeZone(BYR_TZ)))->format('Y-m-d');
$closures = [];
$seen     = [];
foreach ((is_array($in['closures'] ?? null) ? $in['closures'] : []) as $c) {
    $date = trim((string) ($c['date'] ?? ''));
    if ($date === '') {
        continue; /* fila vacía que quedó en el formulario */
    }
    $dt = DateTime::createFromFormat('!Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) {
        json_out(['error' => "La fecha $date no es válida."], 422);
    }
    if ($date < $hoy) {
        continue; /* ya pasó: no hace falta guardarla */
    }
    if (isset($seen[$date])) {
        json_out(['error' => 'Hay dos cierres para el ' . $dt->format('d/m') . '. Dejá uno solo.'], 422);
    }
    $seen[$date] = true;
    $closures[] = ['date' => $date, 'reason' => (string) ($c['reason'] ?? '')];
}

$hours = byr_hours_normalize(['week' => $week, 'closures' => $closures]);

$stmt = $pdo->prepare(
    'INSERT INTO store_settings (skey, svalue, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by)'
);
$stmt->execute([
    'opening_hours',
    json_encode($hours, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $adminId,
]);

$saved = byr_opening_hours($pdo, true);

json_out([
    'ok'        => true,
    'ready'     => true,
    'source'    => $saved['source'],
    'updatedAt' => $saved['updatedAt'],
    'week'      => (object) $saved['week'],
    'closures'  => $saved['closures'],
    'today'     => $hoy,
    'now'       => byr_window_at($saved, new DateTimeImmutable('now', new DateTimeZone(BYR_TZ))),
]);
