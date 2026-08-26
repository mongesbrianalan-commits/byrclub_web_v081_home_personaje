<?php
/**
 * BYR Club — catalogo de logros y misiones (fuente de verdad del servidor).
 *
 * Generado desde assets/core/achievements.js y assets/core/missions.js.
 * Desde que el servidor es duenio del estado, los premios de logros y
 * misiones se acreditan ACA: el navegador ya no puede otorgarse nada.
 * Los archivos JS siguen existiendo para los textos, iconos y categorias
 * que dibuja la UI; si cambia una RECOMPENSA hay que tocar los dos lados.
 *
 * 'metric' dice de que dato del socio depende cada uno. Los calcula
 * byr_progress_metrics() en engine.php, siempre a partir de cosas que el
 * servidor ya sabe: su propio historial de acreditaciones, las fechas de
 * ultima jugada y la tabla redemptions. El cliente no reporta nada, asi
 * que no puede inflar un contador para desbloquear un logro.
 */

/* Logros: se desbloquean una sola vez, para siempre. */
const BYR_ACHIEVEMENTS = [
    ['id' => 'welcome',          'metric' => 'account',            'target' => 1,      'points' => 50,    'xp' => 25,   'icon' => '🍔',   'name' => 'Bienvenido al Club'],
    ['id' => 'first-game',       'metric' => 'game_plays',         'target' => 1,      'points' => 50,    'xp' => 30,   'icon' => '🎮',   'name' => 'Primera partida'],
    ['id' => 'first-scratch',    'metric' => 'scratch_plays',      'target' => 1,      'points' => 75,    'xp' => 40,   'icon' => '🎟️',  'name' => 'A raspar'],
    ['id' => 'scratch-5',        'metric' => 'scratch_plays',      'target' => 5,      'points' => 150,   'xp' => 80,   'icon' => '✨',    'name' => 'Mano afortunada'],
    ['id' => 'scratch-25',       'metric' => 'scratch_plays',      'target' => 25,     'points' => 400,   'xp' => 200,  'icon' => '🏅',   'name' => 'Raspador profesional'],
    ['id' => 'first-roulette',   'metric' => 'roulette_plays',     'target' => 1,      'points' => 75,    'xp' => 40,   'icon' => '🎡',   'name' => 'Que gire la suerte'],
    ['id' => 'roulette-10',      'metric' => 'roulette_plays',     'target' => 10,     'points' => 250,   'xp' => 125,  'icon' => '🎯',   'name' => 'Fan de la ruleta'],
    ['id' => 'points-1000',      'metric' => 'lifetime_points',    'target' => 1000,   'points' => 100,   'xp' => 100,  'icon' => '🪙',   'name' => 'Primer millar'],
    ['id' => 'points-5000',      'metric' => 'lifetime_points',    'target' => 5000,   'points' => 500,   'xp' => 300,  'icon' => '💰',   'name' => 'Cazador de puntos'],
    ['id' => 'level-3',          'metric' => 'level',              'target' => 3,      'points' => 200,   'xp' => 100,  'icon' => '⭐',    'name' => 'Fan de BYR'],
    ['id' => 'level-5',          'metric' => 'level',              'target' => 5,      'points' => 350,   'xp' => 175,  'icon' => '🔥',   'name' => 'Experto BYR'],
    ['id' => 'level-8',          'metric' => 'level',              'target' => 8,      'points' => 600,   'xp' => 300,  'icon' => '🏆',   'name' => 'Maestro BYR'],
    ['id' => 'level-12',         'metric' => 'level',              'target' => 12,     'points' => 1000,  'xp' => 500,  'icon' => '👑',   'name' => 'Leyenda BYR'],
    ['id' => 'streak-3',         'metric' => 'streak',             'target' => 3,      'points' => 150,   'xp' => 100,  'icon' => '🔥',   'name' => 'Tres días al hilo'],
    ['id' => 'streak-7',         'metric' => 'streak',             'target' => 7,      'points' => 400,   'xp' => 250,  'icon' => '📅',   'name' => 'Semana perfecta'],
    ['id' => 'first-prize',      'metric' => 'prizes',             'target' => 1,      'points' => 100,   'xp' => 75,   'icon' => '🎁',   'name' => 'Premio desbloqueado'],
    ['id' => 'prizes-10',        'metric' => 'prizes',             'target' => 10,     'points' => 500,   'xp' => 300,  'icon' => '🎒',   'name' => 'Coleccionista'],
];

/* Misiones: se reinician todos los dias. Se ofrecen BYR_DAILY_MISSIONS
   por dia, elegidas con la fecha como semilla (las mismas para todos). */
const BYR_DAILY_MISSIONS = 3;

const BYR_MISSIONS = [
    ['id' => 'daily-visit',          'metric' => 'today_visit',          'target' => 1,      'points' => 25,    'xp' => 15,   'difficulty' => 'easy',    'icon' => '📅',   'name' => 'Presente en el Club'],
    ['id' => 'daily-game',           'metric' => 'today_games',          'target' => 1,      'points' => 40,    'xp' => 25,   'difficulty' => 'easy',    'icon' => '🎮',   'name' => 'Una partida rápida'],
    ['id' => 'daily-scratch',        'metric' => 'today_scratch',        'target' => 1,      'points' => 50,    'xp' => 30,   'difficulty' => 'easy',    'icon' => '🎟️',  'name' => 'Probá tu suerte'],
    ['id' => 'daily-roulette',       'metric' => 'today_roulette',       'target' => 1,      'points' => 50,    'xp' => 30,   'difficulty' => 'easy',    'icon' => '🎡',   'name' => 'Que gire la suerte'],
    ['id' => 'daily-two-games',      'metric' => 'today_games',          'target' => 2,      'points' => 80,    'xp' => 50,   'difficulty' => 'medium',  'icon' => '🕹️',  'name' => 'Jugador del día'],
    ['id' => 'daily-prize',          'metric' => 'today_prizes',         'target' => 1,      'points' => 75,    'xp' => 50,   'difficulty' => 'medium',  'icon' => '🎁',   'name' => 'Cazador de premios'],
    ['id' => 'daily-achievement',    'metric' => 'today_achievements',   'target' => 1,      'points' => 100,   'xp' => 60,   'difficulty' => 'medium',  'icon' => '🏆',   'name' => 'Día de logros'],
    ['id' => 'daily-three-games',    'metric' => 'today_games',          'target' => 3,      'points' => 150,   'xp' => 90,   'difficulty' => 'hard',    'icon' => '🔥',   'name' => 'Maratón BYR'],
];
