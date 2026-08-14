-- =========================================================
-- BYR Club — Estados del pedido (seguimiento)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin, DESPUÉS de 2026-08-orders.sql.
--
-- Amplía el ciclo de vida del pedido para poder seguirlo:
--   pending     Recibido (esperando que el local lo acepte)
--   confirmed   Aceptado (acá se acreditan los puntos y se cobra)
--   preparing   En preparación
--   on_the_way  En camino (solo delivery)
--   delivered   Entregado / listo
--   cancelled   Cancelado
--
-- Los pedidos existentes conservan su estado (pending/confirmed/cancelled).
-- =========================================================

ALTER TABLE orders
  MODIFY status ENUM('pending','confirmed','preparing','on_the_way','delivered','cancelled')
  NOT NULL DEFAULT 'pending';
