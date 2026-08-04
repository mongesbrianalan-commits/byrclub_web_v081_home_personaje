-- =========================================================
-- Agrega la columna `whatsapp` a `users` si la base se creó
-- con un esquema viejo que no la tenía.
--
-- Síntoma: buscar un cliente por número de WhatsApp en el panel
-- de admin devolvía "Ocurrió un error" (la columna no existía),
-- mientras que buscar por email sí funcionaba.
--
-- Correr UNA vez en phpMyAdmin (pestaña "SQL") de la base de
-- Hostinger. Es seguro aunque la columna ya exista (IF NOT EXISTS).
-- =========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(40) DEFAULT NULL AFTER name;
