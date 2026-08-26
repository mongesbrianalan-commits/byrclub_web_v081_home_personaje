-- =========================================================
-- BYR Club — Migración: límite diario de la Raspadita
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora la raspadita tenía DOS agujeros, los dos por
-- vivir solo en el navegador:
--
--   1. La marca de "ya jugué hoy" se escribía recién al
--      RECLAMAR el premio. Si raspabas y no reclamabas,
--      alcanzaba con refrescar la página para volver a jugar
--      — y como el premio también se sorteaba en el navegador,
--      refrescando hasta que saliera lo que uno quería la
--      raspadita dejaba de ser un sorteo.
--
--   2. Aun después de reclamar, el límite era localStorage:
--      borrando los datos del navegador se jugaba de nuevo.
--      Los vales canjeables ya estaban topeados a uno por día
--      (redemptions), pero los PUNTOS no: se podían farmear.
--
-- Con esta columna el límite pasa a ser del servidor, igual
-- que el giro de la ruleta (last_roulette_spin) y el memotest
-- (last_memory_play).
--
--   last_scratch_play  fecha de la última raspadita jugada
--                      (NULL = todavía no jugó nunca)
-- =========================================================

ALTER TABLE users
  ADD COLUMN last_scratch_play DATE DEFAULT NULL AFTER last_roulette_spin;

-- (Va después de last_roulette_spin y no de last_memory_play a propósito:
--  así esta migración no depende de que la del memotest ya esté corrida.)
--
-- Las cuentas que ya existen quedan en NULL: pueden jugar hoy.
