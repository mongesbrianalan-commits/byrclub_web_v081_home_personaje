-- =========================================================
-- BYR Club — Migración: Pedidos online (menú + carrito)
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL"). Crea las tablas del sistema de pedidos y
-- siembra el menú con los productos conocidos.
--
-- Flujo: el socio arma su pedido desde pedir.html → queda
-- 'pending' en `orders`. El admin lo ve en el panel y al
-- CONFIRMAR se le acreditan los puntos de esa compra y, si
-- adjuntó un cupón, se marca canjeado.
--
-- IMPORTANTE: los precios de siembra son PLACEHOLDER. Ajustalos
-- desde la pestaña "Menú" del panel (o editando los INSERT de
-- abajo) antes de publicar.
-- =========================================================

-- --- Menú: productos a la venta -------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(60)  NOT NULL,                 -- id estable (no cambia con el nombre)
  category    ENUM('promos','entradas','hamburguesas','combos','papas','postres','bebidas','otros') NOT NULL DEFAULT 'otros',
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  image       VARCHAR(190) DEFAULT NULL,             -- ruta bajo assets/ (o NULL)
  emoji       VARCHAR(16)  DEFAULT NULL,             -- fallback si no hay imagen
  price       INT UNSIGNED NOT NULL DEFAULT 0,       -- ARS enteros
  available   TINYINT(1)   NOT NULL DEFAULT 1,       -- 0 = oculto de la carta
  sort        INT          NOT NULL DEFAULT 0,       -- orden dentro de la categoría
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slug (slug),
  KEY idx_available (available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Pedidos ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  status           ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  fulfillment      ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup',
  customer_name    VARCHAR(120) DEFAULT NULL,        -- snapshot del nombre de la cuenta
  customer_phone   VARCHAR(40)  DEFAULT NULL,        -- WhatsApp de contacto
  address          VARCHAR(255) DEFAULT NULL,        -- solo delivery
  notes            VARCHAR(500) DEFAULT NULL,        -- aclaraciones del socio
  items_total      INT UNSIGNED NOT NULL DEFAULT 0,  -- ARS (recalculado server-side)
  points_suggested INT          NOT NULL DEFAULT 0,  -- puntos sugeridos por la tasa
  points_awarded   INT          DEFAULT NULL,        -- puntos que finalmente acreditó el admin
  coupon_code      VARCHAR(16)  DEFAULT NULL,        -- cupón adjunto (redemptions.code)
  coupon_label     VARCHAR(120) DEFAULT NULL,        -- etiqueta del cupón (snapshot)
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at     DATETIME     DEFAULT NULL,
  confirmed_by     INT UNSIGNED DEFAULT NULL,        -- id del admin que lo confirmó/canceló
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Ítems del pedido (precio y nombre congelados al momento de la compra) --
CREATE TABLE IF NOT EXISTS order_items (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED DEFAULT NULL,              -- referencia (puede quedar NULL si borran el producto)
  name       VARCHAR(120) NOT NULL,                  -- snapshot
  unit_price INT UNSIGNED NOT NULL,                  -- snapshot
  qty        SMALLINT UNSIGNED NOT NULL,
  subtotal   INT UNSIGNED NOT NULL,                  -- unit_price * qty
  PRIMARY KEY (id),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Siembra del menú — menú real de BYR Docksud (Que Resto), sin fotos.
-- Precios en pesos. Ajustables desde la pestaña "Menú" del panel.
-- =========================================================
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
