-- =========================================================
-- BYR Club — Migración: límite diario del Memotest
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora el "1 partida por día" del Memotest vivía solo
-- en el navegador (localStorage), así que borrando los datos
-- del navegador o entrando desde otro celular se podía volver
-- a jugar el mismo día y cobrar los puntos de nuevo.
--
-- Con esta columna el límite pasa a ser del servidor, igual
-- que el giro de la ruleta (last_roulette_spin).
--
--   last_memory_play  fecha de la última partida jugada
--                     (NULL = todavía no jugó nunca)
-- =========================================================

ALTER TABLE users
  ADD COLUMN last_memory_play DATE DEFAULT NULL AFTER last_roulette_spin;

-- Las cuentas que ya existen quedan en NULL: pueden jugar hoy.
