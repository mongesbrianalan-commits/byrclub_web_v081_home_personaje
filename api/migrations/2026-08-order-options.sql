-- =========================================================
-- BYR Club — Opciones de producto en los pedidos (papas/bebida/adicionales)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub, pestaña "SQL"),
-- DESPUÉS de 2026-08-orders.sql.
--
-- Agrega la columna donde se guarda el detalle de opciones elegidas en cada
-- ítem del pedido (ej: "Extra cheddar · Coca-Cola · Huevo, Panceta").
-- =========================================================

ALTER TABLE order_items
  ADD COLUMN options VARCHAR(500) DEFAULT NULL AFTER name;
