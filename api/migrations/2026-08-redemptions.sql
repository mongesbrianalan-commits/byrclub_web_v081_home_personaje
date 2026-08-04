-- =========================================================
-- BYR Club — Migración: canje de premios de la ruleta
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL"). Agrega el control de giro diario del lado
-- del servidor y la tabla de vales (redemptions) con código
-- único y estado (pendiente / canjeado).
-- =========================================================

-- 1) Control del giro diario (server-authoritative: no se puede
--    burlar borrando el localStorage).
ALTER TABLE users
  ADD COLUMN last_roulette_spin DATE DEFAULT NULL AFTER referred_by;

-- 2) Vales de premios canjeables (papas, bebida, sorpresa, 2x puntos).
CREATE TABLE IF NOT EXISTS redemptions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  code         VARCHAR(16)  NOT NULL,          -- código único que muestra el cliente
  prize_id     VARCHAR(40)  NOT NULL,
  prize_label  VARCHAR(120) NOT NULL,
  source       VARCHAR(60)  NOT NULL DEFAULT 'Ruleta diaria',
  status       ENUM('pending','redeemed') NOT NULL DEFAULT 'pending',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at  DATETIME     DEFAULT NULL,
  redeemed_by  INT UNSIGNED DEFAULT NULL,      -- id del admin que lo canjeó
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_user (user_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
