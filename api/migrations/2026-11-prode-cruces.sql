-- =========================================================
-- BYR Club — Prode: cruces (octavos, cuartos, semis, final)
-- Correr UNA vez en phpMyAdmin (pestaña SQL).
--
-- En una fecha de cruces, además del resultado, cada socio elige QUIÉN PASA
-- de fase. Acertarlo suma +5 aparte de los puntos del marcador.
--
-- Hasta que no se corra esto, el prode sigue andando como siempre (sin la
-- opción de "quién pasa"): el código chequea que existan las columnas.
-- =========================================================

-- 1 = la fecha es de cruces (se pide "quién pasa" en todos sus partidos).
ALTER TABLE prode_rounds
  ADD COLUMN knockout TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

-- Quién pasó de fase en la realidad (lo carga el panel con el resultado).
ALTER TABLE prode_matches
  ADD COLUMN qualifier ENUM('home','away') DEFAULT NULL AFTER away_goals;

-- Quién eligió el socio que pasa, y los puntos que le dio (+5 / 0).
-- Van aparte de `points` (que sigue siendo solo el marcador: 10 / 5 / 0),
-- así "resultado exacto" se sigue contando como points = 10.
ALTER TABLE prode_predictions
  ADD COLUMN qualifier_pred ENUM('home','away') DEFAULT NULL AFTER away_pred,
  ADD COLUMN qual_points    INT DEFAULT NULL AFTER points;
