-- =========================================================
-- BYR Club — Caja (POS Fase 1): turnos, movimientos y cobros
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub, pestaña "SQL"),
-- DESPUÉS de 2026-08-orders.sql.
--
-- Qué agrega:
--   cash_sessions   apertura y cierre de caja (una abierta a la vez).
--   cash_movements  ingresos/egresos de efectivo que no son ventas.
--   payments        cobros de pedidos (medio de pago), atados a la caja.
--   orders          columnas paid_at + session_id (cuándo y en qué caja se cobró).
--
-- Montos en enteros ($ argentinos, sin centavos), igual que products/orders.
-- =========================================================

-- Turnos de caja. Por ahora una sola caja: nunca debe haber dos 'open' a la vez
-- (lo garantiza el endpoint, que rechaza abrir si ya hay una abierta).
CREATE TABLE IF NOT EXISTS cash_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  status        ENUM('open','closed') NOT NULL DEFAULT 'open',
  opened_by     INT NOT NULL,                         -- admin que abrió
  opened_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_float INT NOT NULL DEFAULT 0,               -- fondo inicial
  closed_by     INT DEFAULT NULL,
  closed_at     DATETIME DEFAULT NULL,
  expected_cash INT DEFAULT NULL,                     -- efectivo esperado al cierre
  counted_cash  INT DEFAULT NULL,                     -- efectivo contado (arqueo)
  difference    INT DEFAULT NULL,                     -- contado - esperado
  notes         VARCHAR(300) DEFAULT NULL,
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Movimientos de efectivo que NO son ventas (retiro, pago proveedor, ingreso).
CREATE TABLE IF NOT EXISTS cash_movements (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  type       ENUM('in','out') NOT NULL,              -- ingreso / egreso
  amount     INT NOT NULL,                            -- siempre positivo
  reason     VARCHAR(200) DEFAULT NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cobros de pedidos. Un pedido puede tener varios (pago dividido, a futuro).
CREATE TABLE IF NOT EXISTS payments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  session_id INT DEFAULT NULL,                        -- caja donde se cobró
  method     ENUM('efectivo','debito','credito','qr','transfer') NOT NULL,
  amount     INT NOT NULL,
  created_by INT NOT NULL,                            -- admin/cajero que cobró
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  KEY idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Marcar en el pedido cuándo y en qué caja se cobró.
ALTER TABLE orders
  ADD COLUMN paid_at    DATETIME DEFAULT NULL,
  ADD COLUMN session_id INT      DEFAULT NULL;
