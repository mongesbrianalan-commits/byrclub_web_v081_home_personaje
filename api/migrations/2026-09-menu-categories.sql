-- =========================================================
-- BYR Club — Migración: categorías del menú editables
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora las categorías eran un ENUM de la tabla products
-- y una lista escrita en tres archivos. Agregar una categoría
-- nueva obligaba a un ALTER TABLE y a tocar código: desde el
-- panel era imposible.
--
-- Esta migración las pasa a una tabla, que es lo que el panel
-- edita. Correrla NO cambia nada de lo que se ve: se siembran
-- las ocho de siempre, con los mismos nombres, emojis y orden
-- que tenía api/menu.php.
-- =========================================================

-- 1) La tabla de categorías.
CREATE TABLE IF NOT EXISTS menu_categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug       VARCHAR(40)  NOT NULL,            -- id estable (no cambia con el nombre)
  name       VARCHAR(60)  NOT NULL,            -- lo que ve el cliente ("Burgers")
  emoji      VARCHAR(16)  DEFAULT NULL,        -- va adelante del nombre en la carta
  option_set VARCHAR(30)  DEFAULT NULL,        -- qué opciones abren sus productos
  sort       INT          NOT NULL DEFAULT 0,  -- orden en la carta (más chico, más arriba)
  available  TINYINT(1)   NOT NULL DEFAULT 1,  -- 0 = no se muestra (ni sus productos)
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slug (slug),
  KEY idx_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Las ocho de siempre, iguales a como estaban en api/menu.php.
--    El ON DUPLICATE KEY es por si hay que correrla dos veces.
INSERT INTO menu_categories (slug, name, emoji, option_set, sort) VALUES
  ('promos',       'Promos',   '🔥', NULL,     10),
  ('entradas',     'Entradas', '🍗', NULL,     20),
  ('hamburguesas', 'Burgers',  '🍔', 'burger', 30),
  ('papas',        'Papas',    '🍟', NULL,     40),
  ('postres',      'Postres',  '🍰', NULL,     50),
  ('bebidas',      'Bebidas',  '🥤', NULL,     60),
  ('combos',       'Combos',   '👑', NULL,     70),
  ('otros',        'Otros',    '🍴', NULL,     80)
ON DUPLICATE KEY UPDATE slug = slug;

-- 3) products.category deja de ser un ENUM.
--    Es el cambio que permite categorías nuevas: el ENUM rechazaba
--    cualquier valor que no estuviera en su lista, así que guardar un
--    producto en una categoría recién creada fallaba en la base.
--    Los valores que ya están guardados no se tocan: son los mismos
--    textos, ahora en una columna que acepta cualquiera.
ALTER TABLE products
  MODIFY COLUMN category VARCHAR(40) NOT NULL DEFAULT 'otros';
