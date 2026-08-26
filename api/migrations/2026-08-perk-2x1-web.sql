-- =========================================================
-- BYR Club — Producto del 2x1 de socio (miércoles) para pedir por la web
-- ---------------------------------------------------------
-- Se corre UNA vez en phpMyAdmin (base u932188446_byrclub,
-- pestaña "SQL").
--
-- Hasta ahora el 2x1 de los miércoles solo se podía reclamar
-- como código y mostrarlo en el local. Para poder sumarlo a un
-- pedido web hace falta que exista como PRODUCTO, igual que las
-- promos que ya están en la carta (3x2 Doble Cheese, etc.).
--
-- Va con available = 0 A PROPÓSITO:
--
--   * El menú normal (api/menu.php) solo trae available = 1, así
--     que este producto NUNCA sale en la carta por accidente.
--   * api/menu.php lo agrega a mano, y solo cuando corresponde:
--     bandera 'perk_2x1_web' encendida + miércoles en Argentina
--     + socio logueado + que no lo haya usado hoy.
--   * api/orders/create.php vuelve a comprobar TODO eso antes de
--     aceptarlo, así que aunque se filtrara en la carta, no se
--     podría pedir.
--
-- Precio: $16.000, el de UNA "Doble con Cheddar". El socio se
-- lleva dos, más dos porciones de papas. Es la misma lógica que
-- el 3x2 Doble Cheese ($32.000 = dos burgers, se lleva tres con
-- sus papas).
-- =========================================================

INSERT INTO products (slug, category, name, description, emoji, price, sort, available)
VALUES (
  'promo-2x1-doble-cheese',
  'promos',
  '2x1 Doble Cheese con papas',
  'Dos Doble con Cheddar y dos porciones de papas, al precio de una. Beneficio de socio, solo los miércoles.',
  '🍔',
  16000,
  5,
  0
)
ON DUPLICATE KEY UPDATE
  name        = VALUES(name),
  description = VALUES(description),
  price       = VALUES(price),
  category    = VALUES(category),
  sort        = VALUES(sort);

-- Ojo: el ON DUPLICATE no toca `available`. Si algún día lo
-- desactivás desde el panel, volver a correr esto no lo prende.
