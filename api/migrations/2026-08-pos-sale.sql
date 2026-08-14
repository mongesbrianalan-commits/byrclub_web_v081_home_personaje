-- =========================================================
-- BYR Club — Venta de mostrador (POS): ventas en el local
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin, DESPUÉS de 2026-08-orders.sql
-- y 2026-08-caja.sql.
--
-- Qué cambia en `orders`:
--   user_id  pasa a admitir NULL  → ventas a "consumidor final" (sin socio).
--   channel  online | mostrador   → de dónde vino la venta.
--   served_by                     → admin/cajero que hizo la venta de mostrador.
--
-- No afecta pedidos existentes (quedan channel='online', user_id intacto).
-- =========================================================

ALTER TABLE orders
  MODIFY user_id INT UNSIGNED NULL,
  ADD COLUMN channel   ENUM('online','mostrador') NOT NULL DEFAULT 'online',
  ADD COLUMN served_by INT UNSIGNED DEFAULT NULL;
