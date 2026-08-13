-- =========================================================
-- BYR Club — Cargar el menú real (BYR Docksud / Que Resto)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub, pestaña "SQL"),
-- DESPUÉS de haber corrido 2026-08-orders.sql.
--
-- Qué hace:
--   1. Amplía las categorías disponibles (agrega promos, entradas, postres).
--   2. Borra el menú de ejemplo (los 8 productos placeholder).
--   3. Carga el menú real, sin fotos (emoji por rubro).
--
-- No afecta los pedidos ya hechos: cada pedido guarda el nombre y el precio
-- del producto por su cuenta (order_items), así que borrar/editar el menú no
-- cambia los pedidos viejos.
-- =========================================================

-- 1) Ampliar el ENUM de categorías (mantiene las que ya estaban).
ALTER TABLE products
  MODIFY category ENUM('promos','entradas','hamburguesas','combos','papas','postres','bebidas','otros')
  NOT NULL DEFAULT 'otros';

-- 2) Vaciar el menú actual (placeholder). Los pedidos NO se tocan.
DELETE FROM products;

-- 3) Cargar el menú real.
INSERT INTO products (slug, category, name, description, emoji, price, sort) VALUES
  -- Promos
  ('promo-triple-cheese',     'promos',       'Triple Cheese Promo',        'Hamburguesa triple con cheddar y porción de papas.',                                      '🍔', 14000, 10),
  ('promo-3x2-crispy-onion',  'promos',       '3x2 Crispy Onion',           '3 Crispy Onion con tres porciones de papas.',                                             '🍔', 35000, 20),
  ('promo-3x2-doble-cheese',  'promos',       '3x2 Doble Cheese',           'Tres dobles con cheddar, acompañadas de tres porciones de papas.',                         '🍔', 32000, 30),
  ('promo-3x2-cuarto-byr',    'promos',       '3x2 Cuarto de BYR',          'Tres Cuarto de BYR más tres porciones de papas.',                                         '🍔', 33000, 40),
  ('promo-dos-pollo-crispy',  'promos',       'Dos Pollo Crispy',           'Dos Pollo Crispy, acompañadas de dos porciones de papas individuales.',                    '🍗', 25000, 50),
  -- Entradas
  ('picada-copada',           'entradas',     'Picada Copada',              '5 nuggets de pollo, 5 bastones de muzzarella, 5 aros de cebolla.',                         '🍗', 14000, 60),
  ('nuggets-pollo-x10',       'entradas',     'Nuggets de pollo x10',       'Nuggets de pollo x10 unidades.',                                                          '🍗', 10500, 70),
  ('aros-cebolla-x10',        'entradas',     'Aros de cebolla x10',        'Aros de cebolla x10 unidades.',                                                           '🧅', 12000, 80),
  ('bastones-muzzarella-x10', 'entradas',     'Bastones de muzzarella x10', 'Bastones de muzzarella x10 unidades.',                                                    '🧀', 12000, 90),
  -- Burgers
  ('simple-cheddar',          'hamburguesas', 'Simple con Cheddar',         'Pan de papa, carne, queso cheddar.',                                                      '🍔', 11000, 100),
  ('doble-cheddar',           'hamburguesas', 'Doble con Cheddar',          'Pan de papa, carne x2, queso cheddar.',                                                   '🍔', 16000, 110),
  ('triple-cheddar',          'hamburguesas', 'Triple con Cheddar',         'Pan de papa, carne x3, cheddar x6.',                                                      '🍔', 21500, 120),
  ('pollo-spicy',             'hamburguesas', 'Pollo Spicy',                'Pan de papa, medallón de pollo crispy, lechuga, tomate, cheddar, mayonesa picante.',       '🍔', 15500, 130),
  ('americana',               'hamburguesas', 'Americana',                  'Pan de papa, carne x2, cheddar x4, panceta, cebolla caramelizada, huevo, salsa barbacoa.', '🍔', 18000, 140),
  ('lt-burger',               'hamburguesas', 'LT Burger',                  'Pan de papa, carne x2, cheddar x4, panceta, lechuga, tomate, salsa barbacoa.',             '🍔', 17000, 150),
  ('byr-mac',                 'hamburguesas', 'BYR Mac',                    'Pan de papa, doble carne, cheddar, lechuga, pepinillos, aderezo BYR.',                     '🍔', 17500, 160),
  ('crispy-onion',            'hamburguesas', 'Crispy Onion',               'Pan de papa, carne x2, cheddar x4, cebolla crispy, panceta, pepino, alioli.',              '🍔', 18000, 170),
  ('cuarto-de-byr',           'hamburguesas', 'Cuarto de BYR',              'Pan de papa, doble carne, cheddar, cebollita en cubos, pepinillos, ketchup, mostaza.',     '🍔', 16500, 180),
  ('stacker-onion',           'hamburguesas', 'Stacker Onion',              'Pan de papa, doble carne, cheddar, panceta, aros de cebolla, salsa alioli.',               '🍔', 19500, 190),
  ('oklahoma',                'hamburguesas', 'Oklahoma',                   'Pan de papa, doble carne, cebolla smasheada, cheddar, pepinillos, salsa BYR.',             '🍔', 17000, 200),
  ('argentina',               'hamburguesas', 'Argentina',                  'Pan de papa, carne x2, lomito, queso dambo, lechuga, tomate, huevo, mayonesa.',            '🍔', 17000, 210),
  ('mundial-ar',              'hamburguesas', 'Mundial AR',                 'Pan de papa, doble carne, doble provoleta, tomate, chimichurri.',                          '🍔', 17000, 220),
  ('tasty',                   'hamburguesas', 'Tasty',                      'Pan de papa, doble carne, cheddar, lechuga, tomate, cebolla cubeteada, salsa tasty.',      '🍔', 17500, 230),
  ('cannons',                 'hamburguesas', 'Cannons',                    'Pan de papa, doble carne, cheddar, panceta, triple bastón de muzzarella, salsa BYR.',      '🍔', 19500, 240),
  ('la-triple',               'hamburguesas', 'La Triple',                  'Pan de papa, carne x3, cheddar x6, panceta, papas bastón, salsa barbacoa.',                '🍔', 21500, 250),
  -- Papas
  ('papas-individual',        'papas',        'Porción individual',         'Papas McCain, corte tradicional.',                                                        '🍟', 4000, 260),
  ('papas-a-caballo',         'papas',        'Papas a Caballo',            'Papas McCain corte tradicional, cheddar, dos huevos a la plancha, una pizca de verdeo. (Para compartir).', '🍟', 11000, 270),
  ('papas-xxl',               'papas',        'Papas XXL',                  'Papas McCain corte tradicional, cheddar, panceta, cebollita de verdeo. (Para compartir).', '🍟', 12500, 280),
  ('papas-meat',              'papas',        'Papas Meat',                 'Papas McCain, cheddar, blend (carne), huevos. (Para compartir).',                          '🍟', 15000, 290),
  -- Postres
  ('tiramisu',                'postres',      'Tiramisú',                   'Postre tiramisú.',                                                                        '🍰', 4000, 300),
  ('chocotorta',              'postres',      'Chocotorta',                 NULL,                                                                                      '🍰', 4000, 310),
  ('cookies-oreo',            'postres',      'Cookies (Oreo)',             NULL,                                                                                      '🍪', 4000, 320),
  ('cheesecake-frutos-rojos', 'postres',      'Cheesecake de frutos rojos', NULL,                                                                                      '🍰', 4000, 330),
  ('tentazione',              'postres',      'Tentazione',                 'Vainillas, dulce de leche, merengue, crema chantilly, duraznos en almíbar.',              '🍰', 4500, 340);
