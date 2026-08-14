-- =========================================================
-- BYR Club — Migración: costo de envío del delivery
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Guarda cuánto se cobró de envío EN CADA PEDIDO, en vez de
-- leer el precio de hoy cada vez que se mira un pedido viejo.
-- Si mañana el envío pasa a $600, los pedidos de ayer siguen
-- mostrando los $490 que el cliente realmente pagó.
--
-- `items_total` sigue siendo SOLO la comida. El total que paga
-- el cliente es items_total + shipping_cost. Los puntos se
-- calculan sobre la comida (el flete no suma puntos).
-- =========================================================

ALTER TABLE orders
  ADD COLUMN shipping_cost INT UNSIGNED NOT NULL DEFAULT 0 AFTER items_total;

-- Los pedidos que ya existen quedan en 0: se hicieron cuando el envío
-- era gratis, y así el historial del cliente sigue siendo fiel.
