-- =========================================================
-- BYR Club — Migración: BYR DT (juego de armar tu equipo)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL"). Si se corre dos veces no rompe nada.
--
-- Precios y presupuestos van en DÉCIMAS DE MILLÓN para no
-- usar decimales: 95 = $9,5 M, 1000 = $100 M.
-- =========================================================

-- 1) Jugadores de la Liga Profesional (se cargan desde API-Football).
CREATE TABLE IF NOT EXISTS dt_players (
  id           INT UNSIGNED NOT NULL,                 -- id del jugador en API-Football
  name         VARCHAR(80)  NOT NULL,                 -- "M. Fernández"
  full_name    VARCHAR(140) DEFAULT NULL,
  club_id      INT UNSIGNED NOT NULL,                 -- id del club en API-Football
  position     ENUM('ARQ','DEF','MED','DEL') NOT NULL,
  number       SMALLINT     DEFAULT NULL,
  photo        VARCHAR(255) DEFAULT NULL,
  price        SMALLINT     NOT NULL DEFAULT 0,       -- décimas de millón (0 = todavía sin precio)
  season_rating DECIMAL(4,2) DEFAULT NULL,            -- nota promedio en la temporada
  season_minutes INT        NOT NULL DEFAULT 0,
  season_goals SMALLINT     NOT NULL DEFAULT 0,
  season_assists SMALLINT   NOT NULL DEFAULT 0,
  price_locked TINYINT(1)   NOT NULL DEFAULT 0,       -- 1 = el admin fijó el precio a mano
  active       TINYINT(1)   NOT NULL DEFAULT 1,       -- 0 = ya no está en el plantel
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_club (club_id),
  KEY idx_pos (position, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Clubes (nombre corto y colores para la camiseta).
CREATE TABLE IF NOT EXISTS dt_clubs (
  id         INT UNSIGNED NOT NULL,                   -- id en API-Football
  name       VARCHAR(90)  NOT NULL,
  short      VARCHAR(6)   NOT NULL,                   -- "RIV"
  logo       VARCHAR(255) DEFAULT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#ffffff', -- camiseta
  trim_color VARCHAR(7)   NOT NULL DEFAULT '#03124a', -- cuello
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Fechas del juego. status: open (se arma el equipo), live (cerrado,
--    se juegan los partidos), closed (terminada, con ganador).
CREATE TABLE IF NOT EXISTS dt_rounds (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  api_round   VARCHAR(60)  NOT NULL,                  -- "Clausura - 13"
  name        VARCHAR(60)  NOT NULL,                  -- "Fecha 13"
  season      INT          NOT NULL,
  deadline    DATETIME     NOT NULL,                  -- UTC: arranque del primer partido
  status      ENUM('open','live','closed') NOT NULL DEFAULT 'open',
  locked_at   DATETIME     DEFAULT NULL,              -- cuándo se congelaron los equipos
  winner_team_id INT UNSIGNED DEFAULT NULL,
  winner_code VARCHAR(16)  DEFAULT NULL,              -- cupón del premio
  prize_delivered TINYINT(1) NOT NULL DEFAULT 0,
  closed_at   DATETIME     DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_round (season, api_round),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Partidos de cada fecha.
CREATE TABLE IF NOT EXISTS dt_fixtures (
  id          INT UNSIGNED NOT NULL,                  -- id del partido en API-Football
  round_id    INT UNSIGNED NOT NULL,
  home_id     INT UNSIGNED NOT NULL,
  away_id     INT UNSIGNED NOT NULL,
  home_name   VARCHAR(90)  NOT NULL,
  away_name   VARCHAR(90)  NOT NULL,
  kickoff     DATETIME     NOT NULL,                  -- UTC
  status      VARCHAR(8)   NOT NULL DEFAULT 'NS',     -- código de la API: NS, 1H, FT, PST…
  home_goals  TINYINT      DEFAULT NULL,
  away_goals  TINYINT      DEFAULT NULL,
  scored      TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 = ya se trajeron los puntajes
  PRIMARY KEY (id),
  KEY idx_round (round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Equipos de los socios (uno por socio).
CREATE TABLE IF NOT EXISTS dt_teams (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(24)  NOT NULL,
  crest       VARCHAR(255) DEFAULT NULL,              -- ruta de la foto del escudo
  formation   VARCHAR(5)   NOT NULL DEFAULT '4-3-3',
  bank        SMALLINT     NOT NULL DEFAULT 1000,     -- plata sin gastar (décimas de millón)
  saved_at    DATETIME     DEFAULT NULL,              -- última vez que confirmó (desempate)
  name_reset  TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 = el admin le borró el nombre
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user (user_id),
  KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Plantel actual de cada equipo (15 jugadores).
CREATE TABLE IF NOT EXISTS dt_squads (
  team_id     INT UNSIGNED NOT NULL,
  player_id   INT UNSIGNED NOT NULL,
  starter     TINYINT(1)   NOT NULL DEFAULT 1,
  captain     TINYINT(1)   NOT NULL DEFAULT 0,
  bought_price SMALLINT    NOT NULL,
  PRIMARY KEY (team_id, player_id),
  KEY idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) Foto del plantel de cada equipo al cerrarse una fecha. Es lo que
--    puntúa: los cambios posteriores no tocan una fecha ya cerrada.
CREATE TABLE IF NOT EXISTS dt_lineups (
  round_id    INT UNSIGNED NOT NULL,
  team_id     INT UNSIGNED NOT NULL,
  player_id   INT UNSIGNED NOT NULL,
  position    ENUM('ARQ','DEF','MED','DEL') NOT NULL,
  starter     TINYINT(1)   NOT NULL,
  captain     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (round_id, team_id, player_id),
  KEY idx_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) Puntaje de cada jugador en cada fecha (uno por jugador y fecha).
CREATE TABLE IF NOT EXISTS dt_scores (
  round_id    INT UNSIGNED NOT NULL,
  player_id   INT UNSIGNED NOT NULL,
  fixture_id  INT UNSIGNED NOT NULL,
  minutes     SMALLINT     NOT NULL DEFAULT 0,
  goals       TINYINT      NOT NULL DEFAULT 0,
  assists     TINYINT      NOT NULL DEFAULT 0,
  yellow      TINYINT      NOT NULL DEFAULT 0,
  red         TINYINT      NOT NULL DEFAULT 0,
  own_goals   TINYINT      NOT NULL DEFAULT 0,
  pen_missed  TINYINT      NOT NULL DEFAULT 0,
  pen_saved   TINYINT      NOT NULL DEFAULT 0,
  clean_sheet TINYINT(1)   NOT NULL DEFAULT 0,
  rating      DECIMAL(4,2) DEFAULT NULL,
  points      SMALLINT     NOT NULL DEFAULT 0,
  manual      TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 = corregido a mano (la API no lo pisa)
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, player_id),
  KEY idx_fixture (fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9) Puntos de cada equipo en cada fecha (se recalcula al traer puntajes).
CREATE TABLE IF NOT EXISTS dt_team_rounds (
  round_id    INT UNSIGNED NOT NULL,
  team_id     INT UNSIGNED NOT NULL,
  points      SMALLINT     NOT NULL DEFAULT 0,
  captain_points SMALLINT  NOT NULL DEFAULT 0,        -- desempate
  saved_at    DATETIME     DEFAULT NULL,              -- desempate: confirmó antes
  PRIMARY KEY (round_id, team_id),
  KEY idx_points (round_id, points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
