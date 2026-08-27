<?php
/**
 * BYR Club — motor de logros, misiones y racha, del lado del servidor.
 *
 * Antes esto vivia entero en el navegador: achievement-engine.js y
 * mission-engine.js llevaban sus contadores en localStorage y llamaban a
 * BYRUser.addPoints() para pagarse solos. Como api/state.php guardaba el
 * estado que le mandaba el navegador, cualquiera con la consola abierta
 * podia acreditarse lo que quisiera — y el ranking, que se arma leyendo
 * ese mismo estado, era forjable con un curl.
 *
 * Ahora el servidor no le cree nada al cliente: recalcula las metricas a
 * partir de datos que ya son suyos (su propio historial de acreditaciones,
 * las fechas de ultima jugada, la tabla redemptions) y acredita lo que
 * corresponda. El cliente no reporta eventos; solo muestra el resultado.
 */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/catalog.php';


/**
 * Nivel a partir del XP. Tiene que dar igual que getLevelFromXp() en
 * assets/core/user.js, o el socio veria un nivel y cobraria otro.
 */
function byr_level_from_xp(int $xp): int
{
    return (int) floor(sqrt(max(0, $xp) / 250)) + 1;
}

/**
 * Las misiones del dia: BYR_DAILY_MISSIONS de las 8, iguales para todos y
 * estables durante todo el dia. "Presente en el Club" va siempre porque la
 * puede completar cualquiera; despues se intenta variar la dificultad.
 *
 * La semilla es la fecha, asi que no hace falta guardar la seleccion en
 * ningun lado: el mismo dia siempre da el mismo set.
 */
function byr_progress_daily_missions(string $date): array
{
    $selected = [];

    foreach (BYR_MISSIONS as $m) {
        if ($m['id'] === 'daily-visit') {
            $selected['daily-visit'] = $m;
        }
    }

    /* Barajado determinista de las demas. */
    $rest = [];
    foreach (BYR_MISSIONS as $m) {
        if ($m['id'] !== 'daily-visit') {
            $rest[] = $m;
        }
    }

    $seed = crc32($date);
    for ($i = count($rest) - 1; $i > 0; $i--) {
        $seed = (1103515245 * $seed + 12345) % 2147483648;
        $j    = (int) ($seed % ($i + 1));

        $swap     = $rest[$i];
        $rest[$i] = $rest[$j];
        $rest[$j] = $swap;
    }

    /* Una facil y una media, si las hay, para que el dia no quede todo duro. */
    foreach (['easy', 'medium'] as $level) {
        foreach ($rest as $m) {
            if (count($selected) >= BYR_DAILY_MISSIONS) {
                break 2;
            }
            if (($m['difficulty'] ?? null) === $level && !isset($selected[$m['id']])) {
                $selected[$m['id']] = $m;
                break;
            }
        }
    }

    foreach ($rest as $m) {
        if (count($selected) >= BYR_DAILY_MISSIONS) {
            break;
        }
        $selected[$m['id']] = $m;
    }

    return array_values($selected);
}

/**
 * Metricas del socio. Todas salen de datos del servidor:
 *   - el historial del estado, que a esta altura solo escribe el servidor
 *   - la tabla redemptions (vales emitidos)
 *   - progression.streak / lastVisit, que lleva byr_progress_visit()
 *
 * El historial de las cuentas viejas puede tener entradas escritas por el
 * navegador, de cuando el cliente era duenio del estado. No se limpian: son
 * historia. De aca en adelante no entra nada que no venga del servidor.
 */
function byr_progress_metrics(PDO $pdo, int $userId, array $state): array
{
    $today = date('Y-m-d');

    $plays      = ['scratch' => 0, 'roulette' => 0, 'memory' => 0];
    $playsToday = ['scratch' => 0, 'roulette' => 0, 'memory' => 0];
    $lifetime   = 0;

    foreach (($state['history'] ?? []) as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $type = (string) ($entry['type'] ?? '');
        $day  = substr((string) ($entry['date'] ?? ''), 0, 10);

        if (isset($plays[$type])) {
            $plays[$type]++;
            if ($day === $today) {
                $playsToday[$type]++;
            }
        }

        /* Puntos ganados de por vida, no netos: canjear no te saca logros.
           byr_grant escribe 'points'; las entradas viejas del navegador,
           'amount'. Los negativos (canjes) no restan. */
        $won = (int) ($entry['points'] ?? $entry['amount'] ?? 0);
        if ($won > 0) {
            $lifetime += $won;
        }
    }

    $achievementsToday = 0;
    foreach (($state['achievements'] ?? []) as $a) {
        if (is_array($a) && substr((string) ($a['unlockedAt'] ?? ''), 0, 10) === $today) {
            $achievementsToday++;
        }
    }

    /* Premios: los vales emitidos, que viven en la base y no en el estado. */
    /* "Hoy" arranca a la medianoche de Argentina, no a la del servidor (que
       está en UTC: el día le cambiaba a las 21:00 de acá). */
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS total, SUM(created_at >= ?) AS hoy
           FROM redemptions
          WHERE user_id = ?'
    );
    $stmt->execute([byr_day_start_db(0), $userId]);
    $prizes = $stmt->fetch();
    if (!$prizes) {
        $prizes = ['total' => 0, 'hoy' => 0];
    }

    return [
        'account'            => 1,
        'game_plays'         => array_sum($plays),
        'scratch_plays'      => $plays['scratch'],
        'roulette_plays'     => $plays['roulette'],
        'lifetime_points'    => $lifetime,
        'level'              => byr_level_from_xp((int) ($state['progression']['xp'] ?? 0)),
        'streak'             => (int) ($state['progression']['streak'] ?? 0),
        'prizes'             => (int) ($prizes['total'] ?? 0),

        'today_visit'        => (($state['progression']['lastVisit'] ?? null) === $today) ? 1 : 0,
        'today_games'        => array_sum($playsToday),
        'today_scratch'      => $playsToday['scratch'],
        'today_roulette'     => $playsToday['roulette'],
        'today_prizes'       => (int) ($prizes['hoy'] ?? 0),
        'today_achievements' => $achievementsToday,
    ];
}

/** Ya tiene este logro? */
function byr_progress_has_achievement(array $state, string $id): bool
{
    foreach (($state['achievements'] ?? []) as $a) {
        if (is_array($a) && ($a['id'] ?? null) === $id) {
            return true;
        }
    }

    return false;
}

/**
 * Marca la visita del dia y actualiza la racha. Devuelve true si es la
 * primera visita de hoy.
 *
 * La racha la lleva el servidor: antes la subia streak.js en el navegador,
 * y de ahi salian los logros de 3 y 7 dias seguidos.
 */
function byr_progress_visit(array &$state): bool
{
    $today = date('Y-m-d');
    $last  = $state['progression']['lastVisit'] ?? null;

    if ($last === $today) {
        return false;
    }

    $state['progression']['streak'] = ($last === date('Y-m-d', strtotime('-1 day')))
        ? (int) ($state['progression']['streak'] ?? 0) + 1
        : 1;

    $state['progression']['lastVisit'] = $today;

    return true;
}

/**
 * Puesta al dia de las cuentas que ya existian.
 *
 * El motor viejo guardaba los logros desbloqueados en SU PROPIO
 * localStorage (byr_achievement_engine_v1), no en state.achievements —
 * pero los puntos si los acreditaba, y esos terminaban en el servidor.
 * O sea que estas cuentas ya cobraron logros de los que no queda rastro
 * en el estado. Si el evaluador los viera como pendientes, los pagaria
 * por segunda vez: miles de puntos regalados.
 *
 * Asi que la primera vez que corre para una cuenta CON historia, damos
 * por desbloqueado todo lo que ya cumple, en silencio y sin pagar. No se
 * le saca nada a nadie (los puntos que tiene se los queda) y de ahi en
 * adelante solo se paga lo que se gane de verdad.
 *
 * Las cuentas nuevas no tienen historia, asi que no se tocan: cobran sus
 * logros normalmente, empezando por "Bienvenido al Club".
 *
 * Devuelve true si hizo la puesta al dia.
 */
function byr_progress_seed(PDO $pdo, int $userId, array &$state): bool
{
    if (!empty($state['progress']['seeded'])) {
        return false;
    }

    $hasHistory = !empty($state['history']) && is_array($state['history']);

    $state['progress'] = [
        'seeded'   => true,
        'seededAt' => date('c'),
    ];

    if (!$hasHistory) {
        return false;
    }

    $metrics = byr_progress_metrics($pdo, $userId, $state);

    if (!isset($state['achievements']) || !is_array($state['achievements'])) {
        $state['achievements'] = [];
    }

    foreach (BYR_ACHIEVEMENTS as $a) {
        if (byr_progress_has_achievement($state, $a['id'])) {
            continue;
        }
        if (($metrics[$a['metric']] ?? 0) < $a['target']) {
            continue;
        }

        $state['achievements'][] = [
            'id'         => $a['id'],
            'label'      => $a['name'],
            'icon'       => $a['icon'],
            'source'     => 'Logro',
            'unlockedAt' => null,   /* no sabemos cuando: es de la epoca vieja */
            'legacy'     => true,
        ];
    }

    return true;
}

/**
 * Recalcula logros y misiones y acredita lo que falte. Modifica $state.
 * Devuelve los ids recien desbloqueados y completados, para que el cliente
 * muestre el cartelito.
 *
 * Va en varias pasadas a proposito: desbloquear un logro suma puntos y XP,
 * y eso puede desbloquear otro (o completar la mision "Dia de logros").
 */
function byr_progress_evaluate(PDO $pdo, int $userId, array &$state): array
{
    $today = date('Y-m-d');

    if (!isset($state['progression']) || !is_array($state['progression'])) {
        $state['progression'] = ['xp' => 0, 'streak' => 0, 'lastVisit' => null];
    }

    /* Cuentas viejas: reconocer lo ya logrado sin volver a pagarlo. */
    byr_progress_seed($pdo, $userId, $state);

    /* Las misiones arrancan de cero cada dia. */
    $missions = $state['missions'] ?? null;
    if (!is_array($missions) || ($missions['date'] ?? null) !== $today) {
        $state['missions'] = ['date' => $today, 'completed' => []];
    }
    if (!isset($state['missions']['completed']) || !is_array($state['missions']['completed'])) {
        $state['missions']['completed'] = [];
    }

    $daily     = byr_progress_daily_missions($today);
    $unlocked  = [];
    $completed = [];

    for ($pass = 0; $pass < 5; $pass++) {
        $changed = false;
        $metrics = byr_progress_metrics($pdo, $userId, $state);

        foreach (BYR_ACHIEVEMENTS as $a) {
            if (byr_progress_has_achievement($state, $a['id'])) {
                continue;
            }
            if (($metrics[$a['metric']] ?? 0) < $a['target']) {
                continue;
            }

            if (!isset($state['achievements']) || !is_array($state['achievements'])) {
                $state['achievements'] = [];
            }
            array_unshift($state['achievements'], [
                'id'         => $a['id'],
                'label'      => $a['name'],
                'icon'       => $a['icon'],
                'source'     => 'Logro',
                'unlockedAt' => date('c'),
            ]);

            byr_grant($state, (int) $a['points'], (int) $a['xp'], 'Logro: ' . $a['name'], 'achievement');

            $unlocked[] = $a['id'];
            $changed    = true;
        }

        foreach ($daily as $m) {
            if (in_array($m['id'], $state['missions']['completed'], true)) {
                continue;
            }
            if (($metrics[$m['metric']] ?? 0) < $m['target']) {
                continue;
            }

            $state['missions']['completed'][] = $m['id'];
            byr_grant($state, (int) $m['points'], (int) $m['xp'], 'Misión: ' . $m['name'], 'mission');

            $completed[] = $m['id'];
            $changed     = true;
        }

        if (!$changed) {
            break;
        }
    }

    return ['unlocked' => $unlocked, 'completed' => $completed];
}

/**
 * El progreso tal como lo dibuja la UI: cada logro y cada mision del dia
 * con cuanto lleva, cuanto necesita y si ya esta.
 */
function byr_progress_report(PDO $pdo, int $userId, array $state): array
{
    $metrics = byr_progress_metrics($pdo, $userId, $state);
    $today   = date('Y-m-d');

    $doneMissions = (($state['missions']['date'] ?? null) === $today)
        ? (array) ($state['missions']['completed'] ?? [])
        : [];

    $achievements = [];
    foreach (BYR_ACHIEVEMENTS as $a) {
        $value = (int) ($metrics[$a['metric']] ?? 0);

        $achievements[] = [
            'id'       => $a['id'],
            'progress' => min($value, (int) $a['target']),
            'target'   => (int) $a['target'],
            'unlocked' => byr_progress_has_achievement($state, $a['id']),
        ];
    }

    $missions = [];
    foreach (byr_progress_daily_missions($today) as $m) {
        $value = (int) ($metrics[$m['metric']] ?? 0);

        $missions[] = [
            'id'        => $m['id'],
            'progress'  => min($value, (int) $m['target']),
            'target'    => (int) $m['target'],
            'completed' => in_array($m['id'], $doneMissions, true),
        ];
    }

    return [
        'achievements' => $achievements,
        'missions'     => $missions,
        'metrics'      => $metrics,
    ];
}
