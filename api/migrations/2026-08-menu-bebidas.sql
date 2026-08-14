-- =========================================================
-- BYR Club — Bebidas sueltas (solo mostrador) + productos "solo staff"
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin, DESPUÉS de 2026-08-menu-byr.sql.
--
-- staff_only = 1  → el producto aparece SOLO en el mostrador (cajero/admin),
--                   nunca en el menú público (pedir.html). Sirve para vender
--                   bebidas sueltas sin ofrecerlas online.
--
-- Se siembran las bebidas como productos simples (sin opciones). Precios y
-- disponibilidad se pueden editar después desde la pestaña Menú del panel.
-- =========================================================

ALTER TABLE products
  ADD COLUMN staff_only TINYINT(1) NOT NULL DEFAULT 0;

INSERT INTO products (slug, category, name, emoji, price, staff_only, sort) VALUES
  ('beb-pepsi',           'bebidas', 'Pepsi',           '🥤', 2500, 1, 400),
  ('beb-coca',            'bebidas', 'Coca-Cola',       '🥤', 2800, 1, 410),
  ('beb-sprite',          'bebidas', 'Sprite',          '🥤', 2800, 1, 420),
  ('beb-fanta',           'bebidas', 'Fanta',           '🥤', 2800, 1, 430),
  ('beb-levite-naranja',  'bebidas', 'Levite Naranja',  '🧃', 2500, 1, 440),
  ('beb-levite-manzana',  'bebidas', 'Levite Manzana',  '🧃', 2500, 1, 450),
  ('beb-levite-pomelo',   'bebidas', 'Levite Pomelo',   '🧃', 2500, 1, 460),
  ('beb-agua',            'bebidas', 'Agua sin gas',    '💧', 2000, 1, 470),
  ('beb-quilmes',         'bebidas', 'Quilmes',         '🍺', 3000, 1, 480),
  ('beb-amstel',          'bebidas', 'Amstel',          '🍺', 3000, 1, 490),
  ('beb-imperial',        'bebidas', 'Imperial Golden', '🍺', 3500, 1, 500);
