-- =========================================================
-- BYR Club — Migración: Cola de impresión (comandas y tickets)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Por qué una cola: la web vive en el hosting y NO puede hablarle
-- directo a la térmica del local. Entonces el server solo ENCOLA
-- el trabajo ya renderizado en ESC/POS, y un agente que corre en
-- la PC del local lo va a buscar y lo manda a la impresora por
-- TCP 9100. Si la impresora está apagada, el trabajo espera.
--
-- Flujo:
--   [venta/pedido] → INSERT en print_jobs (status 'pending')
--        → el agente hace GET api/print/jobs.php   (pasa a 'printing')
--        → imprime por TCP 9100
--        → POST api/print/ack.php                  (pasa a 'done' o 'error')
-- =========================================================

CREATE TABLE IF NOT EXISTS print_jobs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  station     VARCHAR(30)  NOT NULL DEFAULT 'cocina',   -- a qué impresora va
  order_id    INT UNSIGNED DEFAULT NULL,                -- pedido (NULL en pruebas/reportes)
  kind        ENUM('comanda','ticket','test','report') NOT NULL DEFAULT 'comanda',
  payload     MEDIUMTEXT   NOT NULL,                    -- ESC/POS ya renderizado, en base64
  status      ENUM('pending','printing','done','error') NOT NULL DEFAULT 'pending',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,      -- intentos del agente
  last_error  VARCHAR(255) DEFAULT NULL,
  created_by  INT UNSIGNED DEFAULT NULL,                -- staff que lo mandó (NULL = automático)
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  taken_at    DATETIME     DEFAULT NULL,                -- cuándo lo agarró el agente
  printed_at  DATETIME     DEFAULT NULL,                -- cuándo confirmó que salió
  PRIMARY KEY (id),
  KEY idx_queue (station, status, id),                  -- la consulta del agente
  KEY idx_order (order_id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
