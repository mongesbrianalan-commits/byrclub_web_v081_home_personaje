<?php
/**
 * Prode — utilidades compartidas.
 *   - Lectura de la config (API key de API-Football, liga, temporada).
 *   - Cliente HTTP a API-Football (api-sports.io).
 *   - Cálculo de puntaje de un pronóstico.
 *   - Armado de la "tarjeta" de partido para el frontend (con bloqueo y
 *     etiqueta de horario en hora de Argentina).
 */

require_once __DIR__ . '/../helpers.php';

const BYR_PRODE_TZ = 'America/Argentina/Buenos_Aires';

/** Lee y cachea el config.php del server (mismo archivo que usa la base). */
function byr_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $path = __DIR__ . '/../config.php';
        $cfg  = file_exists($path) ? (require $path) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

function byr_apifootball_key(): string
{
    return (string) (byr_config()['apifootball_key'] ?? '');
}

function byr_prode_league(): int
{
    return (int) (byr_config()['prode_league'] ?? 128);
}

function byr_prode_season(): int
{
    return (int) (byr_config()['prode_season'] ?? (int) date('Y'));
}

/**
 * Llama a la API de API-Football y devuelve el array `response`.
 * Lanza RuntimeException si no hay key o si la API falla.
 */
function byr_apifootball_get(string $path, array $params = []): array
{
    $key = byr_apifootball_key();
    if ($key === '') {
        throw new RuntimeException('Falta la API key de fútbol (apifootball_key en config.php).');
    }

    $url = 'https://v3.football.api-sports.io/' . ltrim($path, '/');
    if ($params) {
        $url .= '?' . http_build_query($params);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . $key],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        throw new RuntimeException('No se pudo conectar con la API de fútbol: ' . $err);
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('Respuesta inválida de la API de fútbol.');
    }
    if ($code >= 400 || !empty($data['errors'])) {
        $detail = is_array($data['errors'] ?? null) ? implode(' ', $data['errors']) : 'error';
        throw new RuntimeException('La API de fútbol devolvió un error: ' . $detail);
    }

    return $data['response'] ?? [];
}

/**
 * Puntaje de un pronóstico contra el resultado real.
 *   - Resultado exacto → 10
 *   - Acertó ganador/empate (no el resultado exacto) → 5
 *   - No acertó → 0
 */
function byr_prode_score(int $predH, int $predA, int $realH, int $realA): int
{
    if ($predH === $realH && $predA === $realA) {
        return 10;
    }
    $predSign = $predH <=> $predA; // -1 gana visitante, 0 empate, 1 gana local
    $realSign = $realH <=> $realA;
    return ($predSign === $realSign) ? 5 : 0;
}

/** "Vie 21:30" en hora de Argentina a partir de un DATETIME UTC. */
function byr_prode_kickoff_label(string $kickoffUtc): string
{
    static $dias = ['Sun' => 'Dom', 'Mon' => 'Lun', 'Tue' => 'Mar', 'Wed' => 'Mié', 'Thu' => 'Jue', 'Fri' => 'Vie', 'Sat' => 'Sáb'];
    try {
        $dt = new DateTime($kickoffUtc, new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone(BYR_PRODE_TZ));
    } catch (Exception $e) {
        return '';
    }
    return ($dias[$dt->format('D')] ?? $dt->format('D')) . ' ' . $dt->format('H:i');
}

/** ¿El partido ya arrancó? (bloquea la carga/edición del pronóstico) */
function byr_prode_is_locked(string $kickoffUtc): bool
{
    return gmdate('Y-m-d H:i:s') >= $kickoffUtc;
}
