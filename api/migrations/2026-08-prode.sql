-- =========================================================
-- BYR Club — Prode (pronósticos de fútbol)
-- Correr UNA vez en phpMyAdmin (pestaña SQL) sobre la base del club.
-- Crea 3 tablas: fechas, partidos y pronósticos.
-- =========================================================

-- Una "fecha" del prode (jornada). Agrupa partidos y sirve para el premio
-- al ganador de la fecha.
CREATE TABLE IF NOT EXISTS prode_rounds (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(80)  NOT NULL,                 -- ej: "Fecha 8"
  competition   VARCHAR(80)  NOT NULL DEFAULT 'Primera División Argentina',
  season        INT          NOT NULL,                 -- año de la temporada (ej: 2026)
  status        ENUM('open','closed') NOT NULL DEFAULT 'open',
  prize_awarded TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 = ya se dio el premio al ganador
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Partidos de una fecha. Se cargan desde API-Football (api_fixture_id evita
-- duplicados al re-sincronizar). kickoff se guarda en UTC.
CREATE TABLE IF NOT EXISTS prode_matches (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  round_id       INT UNSIGNED NOT NULL,
  api_fixture_id BIGINT UNSIGNED DEFAULT NULL,          -- id del partido en API-Football
  home_team      VARCHAR(90)  NOT NULL,
  away_team      VARCHAR(90)  NOT NULL,
  home_logo      VARCHAR(255) DEFAULT NULL,
  away_logo      VARCHAR(255) DEFAULT NULL,
  kickoff        DATETIME     NOT NULL,                 -- UTC (para bloquear al arranque)
  status         ENUM('scheduled','finished') NOT NULL DEFAULT 'scheduled',
  home_goals     INT          DEFAULT NULL,
  away_goals     INT          DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixture (api_fixture_id),
  KEY idx_round (round_id),
  KEY idx_kickoff (kickoff),
  CONSTRAINT fk_match_round FOREIGN KEY (round_id) REFERENCES prode_rounds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pronóstico de un socio para un partido. Un solo pronóstico por socio y
-- partido (se actualiza mientras el partido no arrancó). points se calcula
-- cuando se carga el resultado.
CREATE TABLE IF NOT EXISTS prode_predictions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  match_id    INT UNSIGNED NOT NULL,
  home_pred   INT          NOT NULL,
  away_pred   INT          NOT NULL,
  points      INT          DEFAULT NULL,               -- NULL = todavía sin jugar/puntuar
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_match (user_id, match_id),
  KEY idx_match (match_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_pred_match FOREIGN KEY (match_id) REFERENCES prode_matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_pred_user  FOREIGN KEY (user_id)  REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
