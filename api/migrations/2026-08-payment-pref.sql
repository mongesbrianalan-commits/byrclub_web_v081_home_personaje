-- =========================================================
-- BYR Club — Migración: cómo va a pagar el cliente
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- OJO: esto NO es un pago online. Es lo que el cliente DECLARA
-- al hacer el pedido, para que el local sepa con qué se va a
-- encontrar (sobre todo el que sale a repartir). El cobro real
-- se sigue registrando en la caja cuando el staff acepta el
-- pedido, y ese es el dato que manda para el arqueo.
--
--   payment_pref  'efectivo' | 'transferencia' (NULL = no dijo)
--   cash_hint     con cuánto va a pagar, para llevar el vuelto
--                 contado. Solo tiene sentido con efectivo.
-- =========================================================

ALTER TABLE orders
  ADD COLUMN payment_pref ENUM('efectivo','transferencia') DEFAULT NULL AFTER shipping_cost,
  ADD COLUMN cash_hint    INT UNSIGNED DEFAULT NULL AFTER payment_pref;

-- Los pedidos que ya existen quedan en NULL: se hicieron cuando
-- la web todavía no preguntaba, y no hay que inventarles nada.
