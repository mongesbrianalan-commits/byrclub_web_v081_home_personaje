-- =========================================================
-- BYR Club — Opciones por producto (elegibles desde el panel)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora qué opciones abría cada producto lo decidía el
-- CÓDIGO, por categoría: hamburguesas sí, todo lo demás no.
-- Con esta columna lo decidís vos, producto por producto,
-- desde la pestaña Menú del panel.
--
--   option_set = NULL   -> lo que diga la categoría (o sea,
--                          exactamente lo que pasa hoy)
--   option_set = 'none' -> sin opciones, va directo al carrito
--   option_set = 'burger', 'bebida', ...  -> ese juego
--
-- Que NULL signifique "lo de siempre" es a propósito: al correr
-- esta migración no cambia nada. Los productos empiezan a
-- comportarse distinto sólo cuando vos les elegís algo.
-- =========================================================

ALTER TABLE products
  ADD COLUMN option_set VARCHAR(30) DEFAULT NULL AFTER available;

-- Los juegos disponibles se definen en api/menu-options.php
-- (byr_option_sets). Agregar uno nuevo es agregarlo ahí y
-- aparece solo en el desplegable del panel.
