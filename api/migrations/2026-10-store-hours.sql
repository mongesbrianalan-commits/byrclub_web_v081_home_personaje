-- =========================================================
-- BYR Club — Migración: días y horarios editables desde el panel
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora el horario para pedir por la web vivía en
-- api/config.php ('order_hours', 'order_closed_weekdays',
-- 'order_closed_dates'): cambiarlo pedía entrar al hosting.
--
-- Esta tabla guarda ajustes del local que el admin cambia
-- desde el panel (Menú → Días y horarios). Correrla NO cambia
-- nada de lo que se ve: mientras nadie guarde un horario desde
-- el panel, se sigue usando el de config.php.
-- =========================================================

CREATE TABLE IF NOT EXISTS store_settings (
  skey       VARCHAR(60)  NOT NULL,             -- qué ajuste ('opening_hours')
  svalue     MEDIUMTEXT   NOT NULL,             -- el valor, en JSON
  updated_by INT UNSIGNED DEFAULT NULL,         -- el admin que lo guardó
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (skey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
