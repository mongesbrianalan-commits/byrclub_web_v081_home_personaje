-- =========================================================
-- BYR Club — Roles del staff (POS)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin. Agrega roles para separar quién puede
-- hacer qué, sin tocar el flag is_admin existente.
--
--   socio    cliente normal (sin acceso al panel). Es el default.
--   cajero   opera la venta: caja, pedidos, mostrador, canjes.
--   cocina   solo ve los pedidos (comandas).
--   admin    todo. Se mantiene sincronizado con is_admin = 1.
--
-- is_admin sigue siendo el interruptor maestro de admin: acá solo backfilleamos
-- role='admin' para los que ya lo eran, y el resto queda 'socio'.
-- =========================================================

ALTER TABLE users
  ADD COLUMN role ENUM('socio','cajero','cocina','admin') NOT NULL DEFAULT 'socio';

UPDATE users SET role = 'admin' WHERE is_admin = 1;
