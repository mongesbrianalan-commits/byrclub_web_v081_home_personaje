-- =========================================================
-- BYR Club — Notificaciones push (avisos en el celular)
-- Correr UNA vez en phpMyAdmin (pestaña SQL).
--
-- Hasta que no se corra, la web anda igual: el botón "Activar avisos" no
-- aparece y no se manda nada.
-- =========================================================

-- Un registro por dispositivo/navegador que aceptó los avisos. Un socio puede
-- tener varios (celular + compu). Si el navegador da de baja el permiso, el
-- envío falla con 404/410 y la fila se borra sola.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  endpoint    VARCHAR(600) NOT NULL,              -- URL del servicio de push del navegador
  endpoint_hash CHAR(64)   NOT NULL,              -- sha256 del endpoint (para el índice único)
  p256dh      VARCHAR(120) NOT NULL,              -- clave pública del navegador (base64url)
  auth        VARCHAR(40)  NOT NULL,              -- secreto del navegador (base64url)
  user_agent  VARCHAR(190) DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sent   DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_endpoint (endpoint_hash),
  KEY idx_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Claves VAPID del sitio (identifican a byrclub.com ante Google/Apple/Mozilla).
-- Se generan SOLAS la primera vez que hacen falta. No borrar: si cambian,
-- todos los socios tienen que volver a activar los avisos.
CREATE TABLE IF NOT EXISTS push_keys (
  id          TINYINT UNSIGNED NOT NULL,          -- siempre 1
  public_key  VARCHAR(120) NOT NULL,              -- base64url, 65 bytes sin comprimir
  private_pem TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
