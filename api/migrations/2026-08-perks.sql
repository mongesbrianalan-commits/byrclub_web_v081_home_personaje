-- =========================================================
-- BYR Club — Migración: beneficios de socio
-- (cumpleaños, código de invitación / referidos)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL"). Agrega columnas a la tabla `users` y
-- genera un código de invitación para las cuentas ya
-- existentes.
-- =========================================================

-- 1) Columnas nuevas
ALTER TABLE users
  ADD COLUMN birthdate     DATE         DEFAULT NULL AFTER state,
  ADD COLUMN referral_code VARCHAR(12)  DEFAULT NULL AFTER birthdate,
  ADD COLUMN referred_by   INT UNSIGNED DEFAULT NULL AFTER referral_code;

-- 2) Índice único del código (dos personas no pueden tener el mismo)
ALTER TABLE users
  ADD UNIQUE KEY uq_referral_code (referral_code);

-- 3) Backfill: darle un código a las cuentas que ya existían.
--    Genera BYR + 6 caracteres hex en mayúscula a partir de un hash
--    aleatorio. Si por casualidad chocan dos, volvé a correr solo
--    esta línea (afecta únicamente a las filas sin código).
UPDATE users
   SET referral_code = CONCAT('BYR', UPPER(SUBSTRING(MD5(CONCAT(id, email, RAND())), 1, 6)))
 WHERE referral_code IS NULL;
