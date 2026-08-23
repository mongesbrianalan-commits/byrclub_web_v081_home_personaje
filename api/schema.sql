-- =========================================================
-- BYR Club — Estructura de la base de datos (MySQL)
-- Se ejecuta UNA vez en phpMyAdmin (pestaña "SQL") después
-- de crear la base de datos vacía en Hostinger.
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt (password_hash de PHP)
  name          VARCHAR(120) NOT NULL,
  whatsapp      VARCHAR(40)  DEFAULT NULL,
  avatar        VARCHAR(16)  DEFAULT NULL,       -- emoji del personaje
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0, -- 1 = puede cargar puntos
  state         LONGTEXT     DEFAULT NULL,       -- estado de juego (JSON: puntos, xp, inventario, etc.)
  birthdate     DATE         DEFAULT NULL,       -- cumpleaños (para el regalo de socio)
  referral_code VARCHAR(12)  DEFAULT NULL,       -- código propio para invitar amigos
  referred_by   INT UNSIGNED DEFAULT NULL,       -- id del usuario que lo invitó (una sola vez)
  last_roulette_spin DATE    DEFAULT NULL,       -- ultimo giro de ruleta (limite diario server-side)
  last_memory_play   DATE    DEFAULT NULL,       -- ultima partida de memotest (limite diario server-side)
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_referral_code (referral_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pedidos online (menú + carrito). Las tablas products / orders / order_items
-- se crean con migrations/2026-08-orders.sql (ahí va también la siembra del menú).

-- Vales de premios canjeables de la ruleta (ver migrations/2026-08-redemptions.sql).
CREATE TABLE IF NOT EXISTS redemptions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  code         VARCHAR(16)  NOT NULL,
  prize_id     VARCHAR(40)  NOT NULL,
  prize_label  VARCHAR(120) NOT NULL,
  source       VARCHAR(60)  NOT NULL DEFAULT 'Ruleta diaria',
  status       ENUM('pending','redeemed') NOT NULL DEFAULT 'pending',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME     DEFAULT NULL,         -- vence a las 24hs; NULL = no vence (vales viejos)
  redeemed_at  DATETIME     DEFAULT NULL,
  redeemed_by  INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
