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
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_referral_code (referral_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
