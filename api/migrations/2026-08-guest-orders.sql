-- =========================================================
-- BYR Club — Pedido de invitado / cuenta exprés por teléfono
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin.
--
-- Permite crear "cuentas livianas" (sin email ni contraseña usable) cuando
-- alguien pide sin registrarse: el WhatsApp es la identidad y ahí se acreditan
-- los puntos. Para eso, el email deja de ser obligatorio.
--
-- La cuenta se puede "reclamar" después poniéndole email + contraseña. Los
-- registros normales siguen exigiendo email (validado en register.php).
-- =========================================================

ALTER TABLE users
  MODIFY email VARCHAR(190) DEFAULT NULL;
