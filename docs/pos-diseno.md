# BYR Club — Diseño del Punto de Venta (POS)

> Estado: **plan aprobado para revisión** (2026-08-14). Nada implementado todavía.
> Decisiones tomadas con el dueño: **no fiscal por ahora**, impresoras **térmicas de red / varias**, **diseñar completo antes de codear**.

---

## 0. De qué partimos

Ya existe (reutilizable):
- `products` (menú real BYR Docksud), `orders` + `order_items` (con opciones y notas).
- Popup de opciones server-side (`api/menu-options.php`), precios recomputados en `api/orders/create.php`.
- Paso de **confirmar** del admin que acredita puntos (`byr_grant()`).
- Web estática + API PHP en Hostinger + MySQL. Deploy por FTP (GitHub Actions).

Lo que cambia con un POS: **el que vende es el cajero, en el mostrador, cobrando en el momento** — no el socio pidiendo online. El pedido online sigue existiendo como un canal más.

---

## 1. Arquitectura de impresión (la decisión central)

**Problema:** la web vive en un hosting; **no puede** hablar directo con una térmica del local. Con impresoras **de red / varias**, el modelo correcto es una **cola de impresión + agente**, no imprimir desde el navegador.

### Modelo elegido: cola de trabajos + agente por local
```
[Venta cobrada] → server encola print_jobs (comanda→Cocina, ticket→Caja)
                        │
                        ▼
        [Agente en el local] hace polling: GET /api/print/jobs?station=cocina
                        │  imprime por TCP 9100 (ESC/POS) a la IP de la impresora
                        ▼
        POST /api/print/ack  → job marcado como impreso
```

**Por qué así:**
- Desacopla web de hardware: la web nunca toca la impresora, solo encola.
- Soporta **varias impresoras / estaciones / sucursales** por `station`.
- Sin diálogo de "imprimir" por cada ticket; corte automático y cajón de dinero posibles.
- El agente es un programita chico (Node o Python) que corre en una PC/mini-PC del local, o incluso una Raspberry.

**Variantes intercambiables (mismo diseño de cola):**
- **Star CloudPRNT / Epson Server-Direct Print:** la impresora *misma* hace polling a nuestra URL; no hace falta agente. Ideal si las térmicas lo soportan.
- **PrintNode (cloud):** mensualidad, cero mantenimiento local, bueno para multi-sucursal.

El server **renderiza ESC/POS** (con fallback a texto plano); el agente/impresora es un "caño tonto". Así cambiar de transporte no toca la lógica de negocio.

---

## 2. Modelo de datos (tablas nuevas y cambios)

### Nuevas
| Tabla | Para qué | Campos clave |
|---|---|---|
| `pos_stations` | Estaciones/impresoras | id, name (Cocina/Caja/Barra), location, transport (agent/cloudprnt), printer_ip, port, token |
| `cash_sessions` | Apertura/cierre de caja | id, location, opened_by, opened_at, opening_float, closed_by, closed_at, expected_cash, counted_cash, difference, status(open/closed), notes |
| `cash_movements` | Ingresos/egresos de caja | id, session_id, type(in/out), amount, reason, created_by, created_at |
| `payments` | Cobros (permite pago dividido) | id, order_id, session_id, method(efectivo/debito/credito/qr/transfer), amount, tendered, change, created_at |
| `print_jobs` | Cola de impresión | id, station_id, order_id, kind(comanda/ticket/report), payload(ESC/POS), status(pending/printing/done/error), attempts, created_at, printed_at |

### Cambios a tablas existentes
- `orders`: `channel` (online/mostrador/mesa), `table_no` (nullable), `session_id`, `served_by` (cajero), `paid_at`; ampliar `status` a (pending, preparing, ready, paid, delivered, cancelled).
- `users`: `role` enum (admin/cajero/cocina) — se conserva `is_admin` por compatibilidad.

Todo con migraciones SQL en `api/migrations/` para correr en phpMyAdmin, en orden.

---

## 3. Roles y permisos
- **admin:** todo (menú, precios, reportes, reabrir caja, cancelar).
- **cajero:** abrir/cerrar su caja, vender, cobrar, reimprimir, movimientos de caja.
- **cocina:** ver/marcar comandas (KDS), sin acceso a plata.
- Gate server-side por rol en cada endpoint (hoy solo hay `is_admin`).

---

## 4. Pantallas / UI
1. **Login POS + selección de caja/estación.**
2. **Apertura de caja:** fondo inicial, confirma → sesión `open`.
3. **Venta (mostrador):** grilla de productos por categoría, carrito, popup de opciones (reusa el actual), cliente opcional (buscar socio para puntos) o venta anónima. Tipo: takeaway / mesa N°.
4. **Cobro:** medio(s) de pago, monto recibido, **vuelto** automático; confirmar → registra `payment`, marca `paid`, **acredita puntos si hay socio**, **encola comanda a Cocina + ticket a Caja**.
5. **KDS Cocina (fase 2/3):** comandas en preparación, marcar "listo".
6. **Cierre de caja:** arqueo (contado vs esperado), **Z report**, encola impresión del Z.
7. **Reportes:** ventas por día / medio de pago / producto.

---

## 5. Endpoints API (nuevos)
```
POST /api/pos/session/open        abrir caja (fondo inicial)
POST /api/pos/session/close       cerrar caja (arqueo + Z)
GET  /api/pos/session/current     sesión abierta del cajero
POST /api/pos/cash/movement       ingreso/egreso de caja
POST /api/pos/sale                crear venta de mostrador (orden + líneas)
POST /api/orders/pay              registrar pago(s), marcar paid, acreditar puntos, encolar impresión
GET  /api/pos/report/x            reporte parcial (sin cerrar)
GET  /api/pos/report/z            reporte de cierre
GET  /api/print/jobs?station=..   agente: próximos trabajos (con token)
POST /api/print/ack               agente: confirmar impreso / error
```
Reutiliza `create.php` (recompute de precios server-side) para la carga de líneas; el cobro se separa en `pay`.

---

## 6. Flujos clave
**Venta normal:** abrir caja → armar pedido → Cobrar (efectivo $X, vuelto) → server: `payment` + `paid` + puntos + encola comanda(Cocina) y ticket(Caja) → agente imprime.
**Pago dividido:** varios `payments` sobre una misma `order` hasta cubrir el total.
**Cierre:** contar efectivo → `close` calcula esperado (fondo + ventas efectivo + movimientos) vs contado → diferencia → Z impreso.

---

## 7. Fases de entrega
- **Fase 1 — Caja (sin hardware): ✅ IMPLEMENTADA (2026-08-14).** Apertura/cierre, medios de pago, cobro al confirmar pedido, movimientos, X/Z en pantalla. Requiere `api/migrations/2026-08-caja.sql`. Degrada con gracia si la migración no está corrida.
- **Fase 2 — Venta de mostrador: ✅ IMPLEMENTADA (2026-08-14).** Página `mostrador.html` (admin-only): el cajero arma el pedido desde el menú real, identifica al socio (opcional, suma puntos) o consumidor final, elige medio de pago, ve el vuelto y cobra. Crea la venta ya confirmada y pagada, atada a la caja. Endpoint `api/admin/pos-sale.php`. Requiere `api/migrations/2026-08-pos-sale.sql` (user_id nullable + channel/served_by). Falta: roles finos (hoy admin-only).
- **Fase 2 — Impresión:** cola `print_jobs` + agente + renderer ESC/POS 80mm (comanda + ticket). Aquí entra el hardware de red.
- **Fase 3 — Operación:** KDS cocina, reportes avanzados, cajón de dinero, afinado multi-sucursal.
- **Fase 4 — (futuro, si se decide):** fiscal AFIP (factura electrónica / controlador). Proyecto aparte.

---

## 8. Puntos abiertos (a decidir antes de Fase 1/2)
1. **QR/MercadoPago:** ¿solo registrar el medio "QR" a mano, o integrar cobro real (API MP)? Empezar registrando a mano es lo simple.
2. **Multi-sucursal:** ¿una sola caja/local ahora, o desde el día 1 pensar varias? (afecta `location` en todas las tablas — conviene dejar el campo aunque haya una sola).
3. **Impresoras concretas:** marca/modelo y si soportan CloudPRNT (definiría agente vs polling directo).
4. **Puntos en venta de mostrador:** ¿se acreditan siempre que se identifique al socio, con la misma tasa que online?
