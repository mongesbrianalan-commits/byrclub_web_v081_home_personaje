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
  category    ENUM('hamburguesas','papas','bebidas','combos','otros') NOT NULL DEFAULT 'otros',
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
-- Siembra del menú (PLACEHOLDER de precios — ajustar en el panel)
-- Reutiliza las fotos que ya están en assets/rewards/.
-- =========================================================
INSERT INTO products (slug, category, name, description, image, emoji, price, sort) VALUES
  ('cheese-burger', 'hamburguesas', 'Cheese Burger',        'El clásico que nunca falla.',                 'assets/rewards/cheese-burger.jpg', '🍔', 6500, 10),
  ('doble-cheese',  'hamburguesas', 'Doble Cheese Burger',  'Más carne, más cheddar, más ganas.',          'assets/rewards/doble-cheese.jpg',  '🍔', 8500, 20),
  ('cuarto-byr',    'hamburguesas', 'Cuarto de BYR',        'El sabor clásico con sello BYR.',             'assets/rewards/cuarto-byr.jpg',    '🍔', 9000, 30),
  ('americana',     'hamburguesas', 'Americana',            'Huevo, panceta, cebolla y BBQ. Una bomba.',   'assets/rewards/americana.jpg',     '🍔', 9500, 40),
  ('cannons',       'hamburguesas', 'Cannons',              'Cheddar, panceta y bastones. Mucho BYR.',     'assets/rewards/cannons.jpg',       '🍔', 10500, 50),
  ('la-triple',     'hamburguesas', 'La Triple',            'Solo para los que van en serio.',             'assets/rewards/la-triple.jpg',     '🍔', 12000, 60),
  ('papas',         'papas',        'Porción de papas BYR', 'El acompañamiento que nunca sobra.',          'assets/rewards/papas.png',         '🍟', 3500, 10),
  ('coca-cola',     'bebidas',      'Coca-Cola 500cc',      'Para acompañar tu pedido como corresponde.',  'assets/rewards/coca-cola.jpg',     '🥤', 2000, 10);
