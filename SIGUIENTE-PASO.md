# Desde dónde arrancar

Última sesión: **23 de agosto de 2026**, desde la PC de casa.
Todo lo de abajo ya está en GitHub y desplegado en byrclub.com.

Antes que nada, al cambiar de máquina: **`git pull`**.

---

## ⚠️ Migraciones pendientes (phpMyAdmin → base `u932188446_byrclub` → pestaña **SQL**)

**1. Memotest — límite diario (obligatoria para que el juego funcione).**
Hasta que no se corra, el Memotest avisa "vuelve en un rato" y no deja jugar,
a propósito: sin esta columna no se puede garantizar 1 partida por día.

```sql
ALTER TABLE users
  ADD COLUMN last_memory_play DATE DEFAULT NULL AFTER last_roulette_spin;
```

(Está también en `api/migrations/2026-08-memory-daily.sql`.)

**2. Cómo paga el cliente (viene de la sesión anterior).**
Hasta que no se corra, el checkout **no le pregunta al cliente cómo va a
pagar** — todo lo demás anda igual, no se rompe nada.

```sql
ALTER TABLE orders
  ADD COLUMN payment_pref ENUM('efectivo','transferencia') DEFAULT NULL AFTER shipping_cost,
  ADD COLUMN cash_hint    INT UNSIGNED DEFAULT NULL AFTER payment_pref;
```

(Está también en `api/migrations/2026-08-payment-pref.sql`.)

Las de la sesión del local **ya las corriste**:
`2026-08-print-jobs.sql` y `2026-08-delivery-fee.sql`.

---

## Sesión del 23 de agosto de 2026 (desde casa)

### Memotest BYR — publicado, con el límite diario en el servidor

El juego ya estaba entero y probado, escondido detrás de una tarjeta
"Próximamente" en `juegos.html`. Ahora está **Disponible** (JUEGO 03) y el
chip del hero dice 3 oportunidades.

Antes de publicarlo se le arregló el agujero del "1 partida por día": ese
límite vivía **solo en el navegador** (`localStorage`), así que borrando los
datos del navegador o entrando desde otro celular se podía volver a jugar el
mismo día y cobrar los puntos de nuevo. Ahora funciona como la ruleta:

- `users.last_memory_play` guarda la fecha de la última partida.
- `api/memory/status.php` (GET) dice si la partida de hoy sigue disponible.
- `api/memory/finish.php` (POST) cierra la partida: chequea el día, **calcula
  el premio ahí** (el navegador solo informa cuántos intentos hizo) y acredita
  puntos y XP. Máximo posible: 120 puntos y 70 XP.
- El `localStorage` quedó como pista para que no parpadee el tablero, pero
  borrarlo ya no habilita otra partida.
- Si se cae la red justo al terminar, aparece un botón **Reintentar**: el
  tablero ya está resuelto, no hay que volver a jugar.

**Lo que sigue sin poder verificar el servidor:** cuántos intentos declara el
navegador. Alguien que sepa tocar la consola puede decir "lo hice en 8" y
llevarse los 120 en vez de 60. Es una diferencia de 60 puntos, una vez por
día. Cerrarlo del todo implica que el servidor arme el tablero y valide cada
jugada — se puede hacer, pero es otro trabajo.

---

## Sesión anterior (14/15 de agosto, desde el local)

### 1. Impresión de comandas y tickets — ✅ andando en el local

La web no le habla a la impresora: deja el trabajo en una cola (`print_jobs`)
y un agente que corre en la PC del local lo saca y lo manda a la térmica por
TCP 9100. Si la impresora está apagada, el trabajo **espera** y sale después.

- Impresora: **192.168.0.250** (aparece en Windows como "Generic / Text Only").
- La comanda sale **sola** al cobrar en mostrador o al aceptar un pedido online.
- Botones **🖨️ Comanda / 🖨️ Ticket** en cada pedido del panel para reimprimir.
- El agente vive en `tools/print-agent/` y **ya está instalado en la PC del
  local**, arrancando solo al prender la máquina.

> **Ojo desde casa:** en la PC de casa **no hay agente ni `config.json`**, así
> que si tocás "Comanda" no va a salir nada (queda encolado y sale cuando el
> local esté prendido). Eso es lo esperado, no es un error.

Para cambiar cómo se ve una comanda o un ticket: `api/printing.php`. Se toca
ahí y ya sale distinto en el local, sin pisar esa PC.

### 2. Envío fijo de $490 — ✅ activo

Configurable con `'delivery_fee'` en `api/config.php`. Cada pedido guarda
cuánto se le cobró, así subir el precio no reescribe pedidos viejos.
**El envío no suma puntos** (se calculan sobre la comida).

### 3. Campanita de pedido nuevo — ✅ activa

El panel pregunta cada 15s si entró un pedido y suena. Se puede apagar con el
botón **🔔 Campanita**.

> Al empezar el turno conviene **tocar el botón de la campanita una vez**: los
> navegadores no dejan sonar nada hasta que alguien hace clic en la página.

### 4. Estadísticas delivery vs. retiro — ✅ activas

Abajo de la lista de pedidos: Hoy / Últimos 7 días / Desde siempre, con
cantidad y monto. **Mostrador va separado de "retiro"** a propósito.

### 5. Editar un pedido — ✅ mejorado

- Se puede agregar **cualquier cosa del menú** (antes las hamburguesas no).
- **✏️ en todas las líneas**: cambia opciones o deja una aclaración a cocina.
- Los **adicionales tienen cantidad** (dos fetas de cheddar). Salen como
  "Cheddar para hamburguesa x2".
- El popup abre **con lo que la línea ya tenía**, así editar una cosa no borra
  las otras.

### 6. Cómo paga el cliente — ⏳ falta la migración de arriba

Elige **efectivo** o **transferencia** al pedir. Si es efectivo, puede decir
con cuánto paga, y el panel y la comanda muestran el vuelto ya calculado.
Al aceptar el pedido, el selector de cobro viene preseleccionado con lo que
declaró (se puede cambiar: manda lo que realmente pagó).

**No es pago online.** Es una declaración; el cobro real se registra en la caja.

Alias de transferencia: **BYRDOCKSUD.MP** (por defecto en `api/menu.php`,
pisable desde `config.php` con `'transfer_alias'`).

---

## Para probar el Memotest (se puede desde casa)

1. Correr la migración `2026-08-memory-daily.sql`.
2. Entrar a **Juegos → Memotest BYR** y completar el tablero. Tiene que sumar
   los puntos y mostrarlos en el perfil.
3. **La prueba que importa:** borrar los datos del sitio en el navegador
   (o abrir una ventana de incógnito) y volver a entrar al Memotest con la
   misma cuenta. Tiene que decir *"Ya jugaste hoy"* con el tablero revelado,
   y **no** tiene que volver a sumar puntos. Antes de este cambio, sumaba.
4. Bonus: abrirlo en el celular con la misma cuenta → mismo resultado.

---

## Para probar cuando vuelvas al local

1. Correr la migración de los medios de pago (la número 2 de arriba).
2. Hacer un pedido de prueba desde el celular eligiendo **transferencia** →
   tiene que mostrar el alias BYRDOCKSUD.MP.
3. Otro eligiendo **efectivo con $20.000** → el panel tiene que mostrar el
   vuelto, y la comanda impresa tiene que decir `PAGA: EFECTIVO`.
4. Editar un pedido pendiente: agregarle una hamburguesa con 2 de cheddar y
   verificar que el total suba $3.000.

---

## Decisiones que quedaron abiertas

- **El campo "¿con cuánto pagás?"** lo agregó Claude por su cuenta (vos
  pediste solo los dos medios de pago). Si ensucia el formulario, se saca en
  un minuto.
- **Reimprimir la comanda al editar un pedido ya aceptado.** Hoy, si editás
  después de aceptar, la comanda impresa quedó vieja y hay que apretar
  🖨️ Comanda a mano. Se puede automatizar.
- **Zonas de delivery.** Hoy el envío es uno solo para todos ($490). Si querés
  cobrar distinto por zona, hay que definir las zonas.
- **La EPSON de 192.168.0.101** estaba apagada y quedó afuera. Si algún día la
  querés como segunda estación (comanda en cocina, ticket en caja), son dos
  líneas de `config.php`.

## Lo próximo grande

La **PWA instalable**, que venía quedando para después de los pedidos.
