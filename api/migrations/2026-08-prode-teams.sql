-- =========================================================
-- BYR Club — Prode: tabla de equipos (para los escudos)
-- Correr UNA vez en phpMyAdmin (pestaña SQL).
-- Guarda el nombre + escudo de cada equipo de Primera (traidos de
-- API-Football). `norm` es el nombre normalizado para matchear con el
-- nombre que se carga a mano.
-- =========================================================
CREATE TABLE IF NOT EXISTS prode_teams (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  api_team_id BIGINT UNSIGNED DEFAULT NULL,
  name        VARCHAR(90)  NOT NULL,
  norm        VARCHAR(90)  NOT NULL,
  logo        VARCHAR(255) DEFAULT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_norm (norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
