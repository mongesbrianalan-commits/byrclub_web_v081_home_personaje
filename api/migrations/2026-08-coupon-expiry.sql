-- =========================================================
-- BYR Club — Migración: vencimiento de cupones (24hs)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL"). Agrega la columna de vencimiento a los vales.
--
-- A partir de ahora cada cupón nuevo vence a las 24hs de emitido.
-- Los cupones que YA existen quedan con expires_at = NULL, lo que
-- significa "no vence" (así no se les caen a los socios de golpe).
-- =========================================================

ALTER TABLE redemptions
  ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER created_at,
  ADD KEY idx_expires (expires_at);
