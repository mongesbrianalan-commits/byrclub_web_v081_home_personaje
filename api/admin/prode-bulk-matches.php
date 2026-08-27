<?php
/**
 * ADMIN — Carga la fecha ENTERA de una sola vez, pegando el fixture como texto.
 *
 * Antes había que cargar partido por partido (cinco campos por partido, catorce
 * veces por fecha). Acá se pega la lista tal como viene y el servidor la
 * interpreta: una línea por partido, con el día y la hora en cualquier orden.
 *
 * El parser es a propósito tolerante, porque el fixture se copia de donde sea:
 *   Sábado 30/08
 *   21:00  Boca Juniors vs River Plate
 *   Racing - Independiente 19:15
 *   2026-08-31 17:00 | Talleres | Belgrano
 *
 * Una línea que trae fecha pero ningún partido (ej. "Sábado 30/08") queda como
 * ENCABEZADO DE DÍA: las líneas que siguen heredan ese día hasta que aparezca
 * otro. Así se pega el fixture agrupado por jornada sin repetir la fecha.
 *
 * Body JSON:
 *   roundName: string  nombre de la fecha (ej. "Fecha 8"). Se reusa si existe.
 *   text:      string  el fixture pegado
 *   dryRun:    bool    true = sólo interpretar y devolver, sin tocar la base
 *
 * Respuesta: { ok, dryRun, roundId?, rows: [...], counts: {matches, days, errors, duplicates} }
 *
 * Los horarios se ingresan en hora de Argentina y se guardan en UTC, igual que
 * en prode-add-match.php.
 */
require_once __DIR__ . '/../prode/lib.php';
require_method('POST');

$id  = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$id]);
$me = $stmt->fetch();
if (!$me || !$me['is_admin']) {
    json_out(['error' => 'No tenés permisos para hacer esto.'], 403);
}

$in        = body_json();
$roundName = trim((string) ($in['roundName'] ?? ''));
$text      = (string) ($in['text'] ?? '');
$dryRun    = !empty($in['dryRun']);

if ($roundName === '') {
    json_out(['error' => 'Ponele un nombre a la fecha (ej. "Fecha 8").'], 422);
}
if (trim($text) === '') {
    json_out(['error' => 'Pegá la lista de partidos.'], 422);
}

/* =========================================================
   Parser
========================================================= */

const BYR_PRODE_MESES = [
    'enero' => 1, 'febrero' => 2, 'marzo' => 3, 'abril' => 4, 'mayo' => 5, 'junio' => 6,
    'julio' => 7, 'agosto' => 8, 'septiembre' => 9, 'setiembre' => 9, 'octubre' => 10,
    'noviembre' => 11, 'diciembre' => 12,
];

/**
 * Completa el año cuando el fixture no lo trae (el caso normal: "30/08").
 * Usa el año actual en Argentina, y si eso deja al partido más de dos meses en
 * el pasado, salta al siguiente: en diciembre se carga el fixture de enero.
 */
function byr_prode_guess_year(int $d, int $m): int
{
    $today = new DateTime('now', new DateTimeZone(BYR_PRODE_TZ));
    $year  = (int) $today->format('Y');
    $try   = DateTime::createFromFormat(
        'Y-n-j H:i:s',
        $year . '-' . $m . '-' . $d . ' 00:00:00',
        new DateTimeZone(BYR_PRODE_TZ)
    );
    if ($try && (int) $today->diff($try)->days > 60 && $try < $today) {
        $year++;
    }
    return $year;
}

/** ¿Existe de verdad ese día? (31 de febrero se cae acá, no en la base). */
function byr_prode_valid_date(int $y, int $m, int $d): bool
{
    return $m >= 1 && $m <= 12 && $d >= 1 && checkdate($m, $d, $y);
}

/**
 * Saca la HORA de la línea y la devuelve junto con el texto sin ese pedazo.
 * Acepta 21:00, 21.00, 21h30, 21hs, 21 hs. No acepta el punto solo (21.00
 * a secas) porque choca con las fechas escritas 30.08.
 */
function byr_prode_extract_time(string $s): array
{
    if (preg_match('/(?<![\d:.])([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)(?!\d)/i', $s, $m, PREG_OFFSET_CAPTURE)) {
        $time = sprintf('%02d:%02d', (int) $m[1][0], (int) $m[2][0]);
        return [$time, substr_replace($s, ' ', $m[0][1], strlen($m[0][0]))];
    }
    if (preg_match('/(?<![\d:.])([01]?\d|2[0-3])\s*hs?\b/i', $s, $m, PREG_OFFSET_CAPTURE)) {
        $time = sprintf('%02d:00', (int) $m[1][0]);
        return [$time, substr_replace($s, ' ', $m[0][1], strlen($m[0][0]))];
    }
    return [null, $s];
}

/**
 * Saca la FECHA de la línea y la devuelve como Y-m-d junto con el resto.
 * Acepta 2026-08-30, 30/08/2026, 30/08, 30-8, 30.08 y "30 de agosto".
 */
function byr_prode_extract_date(string $s): array
{
    /* ISO primero: es la única sin ambigüedad. */
    if (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/', $s, $m, PREG_OFFSET_CAPTURE)) {
        $y = (int) $m[1][0];
        $mo = (int) $m[2][0];
        $d = (int) $m[3][0];
        if (byr_prode_valid_date($y, $mo, $d)) {
            return [sprintf('%04d-%02d-%02d', $y, $mo, $d), substr_replace($s, ' ', $m[0][1], strlen($m[0][0]))];
        }
    }

    /* "30 de agosto [de 2026]" */
    $meses = implode('|', array_keys(BYR_PRODE_MESES));
    if (preg_match('/\b(\d{1,2})\s+de\s+(' . $meses . ')(?:\s+de(?:l)?\s+(\d{4}))?\b/iu', $s, $m, PREG_OFFSET_CAPTURE)) {
        $d   = (int) $m[1][0];
        $mes = function_exists('mb_strtolower') ? mb_strtolower($m[2][0], 'UTF-8') : strtolower($m[2][0]);
        $mo  = BYR_PRODE_MESES[$mes] ?? 0;
        $y  = isset($m[3]) && $m[3][0] !== '' ? (int) $m[3][0] : byr_prode_guess_year($d, $mo);
        if (byr_prode_valid_date($y, $mo, $d)) {
            return [sprintf('%04d-%02d-%02d', $y, $mo, $d), substr_replace($s, ' ', $m[0][1], strlen($m[0][0]))];
        }
    }

    /* dd/mm[/yy(yy)] — día primero: es como se escribe acá, y "08/09" en un
       fixture argentino es el 8 de septiembre.

       El guion sin año queda AFUERA a propósito: "Boca 2-1 River" se leería
       como el 2 de enero y el partido entraría con el día equivocado sin que
       nadie se entere. Con guion hay que poner el año (30-08-2026); para la
       forma corta van la barra o el punto, que es como viene el fixture. */
    $formas = [
        '/\b(\d{1,2})[\/\.](\d{1,2})(?:[\/\.\-](\d{2,4}))?\b/',
        '/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/',
    ];
    foreach ($formas as $re) {
        if (!preg_match($re, $s, $m, PREG_OFFSET_CAPTURE)) {
            continue;
        }
        $d  = (int) $m[1][0];
        $mo = (int) $m[2][0];
        $y  = isset($m[3]) && $m[3][0] !== '' ? (int) $m[3][0] : byr_prode_guess_year($d, $mo);
        if ($y < 100) {
            $y += 2000;
        }
        if (byr_prode_valid_date($y, $mo, $d)) {
            return [sprintf('%04d-%02d-%02d', $y, $mo, $d), substr_replace($s, ' ', $m[0][1], strlen($m[0][0]))];
        }
    }

    return [null, $s];
}

/**
 * Limpia lo que sobra una vez sacados el día y la hora: viñetas, día de la
 * semana, separadores sueltos.
 *
 * El recorte de los bordes va con preg_replace y no con trim(): la lista de
 * caracteres tiene guiones largos y puntos medios, que son multibyte, y trim()
 * trabaja byte a byte — le comería medio carácter a un nombre acentuado.
 */
function byr_prode_clean_rest(string $s): string
{
    $s = preg_replace('/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b\.?/iu', ' ', $s);
    $s = preg_replace('/^\s*[-–—•*·]+\s*/u', ' ', $s);          // viñeta al principio
    $s = preg_replace('/^\s*\d{1,2}\s*[\)\.]\s+/u', ' ', $s);   // "1) " o "1. " numerando la lista
    $s = preg_replace('/\s+/u', ' ', $s);
    return byr_prode_trim_edges($s);
}

/** Recorta espacios y separadores decorativos de los dos bordes, sin romper UTF-8. */
function byr_prode_trim_edges(string $s): string
{
    return preg_replace('/^[\s\-–—|·,;:]+|[\s\-–—|·,;:]+$/u', '', $s);
}

/**
 * Parte el resto en local y visitante. Prueba primero "vs" (lo más explícito)
 * y recién después el guion, que también se usa de separador decorativo.
 */
function byr_prode_split_teams(string $s): ?array
{
    $seps = [
        '/\s+(?:vs?\.?|versus)\s+/iu',
        '/\s+x\s+/iu',
        '/\s*\|\s*/u',
        '/\s+[-–—]\s+/u',
    ];
    foreach ($seps as $re) {
        $parts = preg_split($re, $s, 2);
        if (count($parts) === 2) {
            $home = byr_prode_trim_edges($parts[0]);
            $away = byr_prode_trim_edges($parts[1]);
            if ($home !== '' && $away !== '') {
                return [$home, $away];
            }
        }
    }
    return null;
}

/* --- Recorrido línea por línea --- */

$lines = preg_split('/\r\n|\r|\n/', $text);
if (count($lines) > 200) {
    json_out(['error' => 'Son demasiadas líneas. Pegá una fecha por vez.'], 422);
}

$rows        = [];
$currentDate = null;
$counts      = ['matches' => 0, 'days' => 0, 'errors' => 0, 'duplicates' => 0];

foreach ($lines as $i => $rawLine) {
    $lineNo = $i + 1;
    $raw    = trim($rawLine);

    if ($raw === '' || preg_match('/^(#|\/\/)/', $raw)) {
        continue; // vacía o comentario: ni se reporta
    }

    [$time, $rest] = byr_prode_extract_time($raw);
    [$date, $rest] = byr_prode_extract_date($rest);
    $rest          = byr_prode_clean_rest($rest);
    $teams         = byr_prode_split_teams($rest);

    /* Encabezado de día: trae fecha y ningún partido. Fija el día de las que siguen. */
    if (!$teams) {
        if ($date !== null && $rest === '') {
            $currentDate = $date;
            $counts['days']++;
            $rows[] = ['line' => $lineNo, 'raw' => $raw, 'kind' => 'day', 'date' => $date];
            continue;
        }
        $counts['errors']++;
        $rows[] = [
            'line' => $lineNo, 'raw' => $raw, 'kind' => 'error',
            'error' => 'No se entiende qué dos equipos juegan. Escribilo como "Local vs Visitante".',
        ];
        continue;
    }

    $useDate = $date ?? $currentDate;
    if ($useDate === null) {
        $counts['errors']++;
        $rows[] = [
            'line' => $lineNo, 'raw' => $raw, 'kind' => 'error',
            'error' => 'Falta el día. Ponelo en la línea (30/08, 30 de agosto, 2026-08-30) o arriba, en una línea sola que sirva de encabezado.',
        ];
        continue;
    }
    if ($time === null) {
        $counts['errors']++;
        $rows[] = [
            'line' => $lineNo, 'raw' => $raw, 'kind' => 'error',
            'error' => 'Falta el horario, o está escrito de una forma que no leemos. Van 21:00, 21h30 o 21hs (el punto no, porque se confunde con la fecha).',
        ];
        continue;
    }

    /* Hora de Argentina → UTC, igual que la carga de a uno. */
    try {
        $dt = new DateTime($useDate . ' ' . $time . ':00', new DateTimeZone(BYR_PRODE_TZ));
        $dt->setTimezone(new DateTimeZone('UTC'));
    } catch (Exception $e) {
        $counts['errors']++;
        $rows[] = ['line' => $lineNo, 'raw' => $raw, 'kind' => 'error', 'error' => 'Día u horario inválido.'];
        continue;
    }

    $counts['matches']++;
    $rows[] = [
        'line'         => $lineNo,
        'raw'          => $raw,
        'kind'         => 'match',
        'home'         => $teams[0],
        'away'         => $teams[1],
        'date'         => $useDate,
        'time'         => $time,
        'kickoffUtc'   => $dt->format('Y-m-d H:i:s'),
        'kickoffLabel' => byr_prode_kickoff_label($dt->format('Y-m-d H:i:s')),
    ];
}

if ($counts['matches'] === 0 && $counts['errors'] === 0) {
    json_out(['error' => 'No encontramos ningún partido en lo que pegaste.'], 422);
}

/* =========================================================
   Base
========================================================= */

/* Chequeo temprano: sin las tablas del Prode avisamos claro, no un 500 pelado. */
try {
    $pdo->query('SELECT 1 FROM prode_rounds LIMIT 1');
    $pdo->query('SELECT 1 FROM prode_matches LIMIT 1');
} catch (PDOException $e) {
    json_out([
        'error' => 'Faltan las tablas del Prode. Corré la migración 2026-08-prode.sql en phpMyAdmin y volvé a probar.',
        'code'  => 'no-tables',
    ], 500);
}

$season = byr_prode_season();

/* ¿La fecha ya existe? En el ensayo sirve para avisar que se va a agregar a
   una fecha que ya tiene partidos, en vez de crear una nueva. */
$stmt = $pdo->prepare('SELECT id FROM prode_rounds WHERE name = ? AND season = ? LIMIT 1');
$stmt->execute([$roundName, $season]);
$roundId = $stmt->fetchColumn();
$roundId = $roundId ? (int) $roundId : null;

/* Partidos que ya están cargados en esa fecha, normalizados: pegar dos veces
   la misma lista no tiene que duplicar nada. */
$existing = [];
if ($roundId) {
    $stmt = $pdo->prepare('SELECT home_team, away_team FROM prode_matches WHERE round_id = ?');
    $stmt->execute([$roundId]);
    foreach ($stmt->fetchAll() as $m) {
        $existing[byr_prode_normalize_team($m['home_team']) . '|' . byr_prode_normalize_team($m['away_team'])] = true;
    }
}

/* Duplicados dentro de lo que se pegó, además de contra lo ya cargado. */
$seen = [];
foreach ($rows as &$row) {
    if ($row['kind'] !== 'match') {
        continue;
    }
    $key = byr_prode_normalize_team($row['home']) . '|' . byr_prode_normalize_team($row['away']);
    if (isset($existing[$key]) || isset($seen[$key])) {
        $row['kind']      = 'duplicate';
        $row['duplicate'] = isset($existing[$key]) ? 'ya-cargado' : 'repetido-en-la-lista';
        $counts['matches']--;
        $counts['duplicates']++;
        continue;
    }
    $seen[$key] = true;
}
unset($row);

/* --- Ensayo: se devuelve lo interpretado y no se toca nada --- */
if ($dryRun) {
    json_out([
        'ok'          => true,
        'dryRun'      => true,
        'roundName'   => $roundName,
        'roundId'     => $roundId,
        'roundExists' => $roundId !== null,
        'rows'        => $rows,
        'counts'      => $counts,
    ]);
}

/* --- Carga de verdad --------------------------------------------------
   Si quedó alguna línea con error no se carga NADA. Media fecha cargada es
   peor que ninguna: hay que mirar uno por uno cuáles entraron. Se arregla la
   línea y se vuelve a pegar la lista entera (los repetidos se saltean solos). */
if ($counts['errors'] > 0) {
    json_out([
        'error'  => 'Hay ' . $counts['errors'] . ' línea(s) que no se entienden. Corregilas y volvé a cargar: no se cargó ningún partido.',
        'code'   => 'has-errors',
        'rows'   => $rows,
        'counts' => $counts,
    ], 422);
}
if ($counts['matches'] === 0) {
    json_out([
        'error'  => 'Todos los partidos de la lista ya estaban cargados en esta fecha.',
        'code'   => 'all-duplicates',
        'rows'   => $rows,
        'counts' => $counts,
    ], 422);
}

try {
    $pdo->beginTransaction();

    if (!$roundId) {
        $pdo->prepare('INSERT INTO prode_rounds (name, competition, season) VALUES (?, ?, ?)')
            ->execute([$roundName, 'Primera División Argentina', $season]);
        $roundId = (int) $pdo->lastInsertId();
    }

    $ins = $pdo->prepare(
        'INSERT INTO prode_matches (round_id, home_team, away_team, home_logo, away_logo, kickoff, status)
         VALUES (?, ?, ?, ?, ?, ?, "scheduled")'
    );

    foreach ($rows as &$row) {
        if ($row['kind'] !== 'match') {
            continue;
        }
        /* Escudo por nombre, como en la carga de a uno: si el equipo no está en
           prode_teams se guarda NULL y el partido igual entra. */
        $homeLogo = byr_prode_find_logo($pdo, $row['home']);
        $awayLogo = byr_prode_find_logo($pdo, $row['away']);
        $ins->execute([$roundId, $row['home'], $row['away'], $homeLogo, $awayLogo, $row['kickoffUtc']]);
        $row['matchId'] = (int) $pdo->lastInsertId();
        $row['logos']   = ($homeLogo ? 1 : 0) + ($awayLogo ? 1 : 0);
    }
    unset($row);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('prode-bulk-matches: ' . $e->getMessage());
    json_out(['error' => 'No se pudieron guardar los partidos. No se cargó ninguno; probá de nuevo.'], 500);
}

json_out([
    'ok'        => true,
    'dryRun'    => false,
    'roundName' => $roundName,
    'roundId'   => $roundId,
    'rows'      => $rows,
    'counts'    => $counts,
]);
