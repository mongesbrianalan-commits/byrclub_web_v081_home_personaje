# Desde dónde arrancar

Última sesión: **27 de agosto de 2026**, desde la PC de casa.
Todo lo de abajo ya está en GitHub y desplegado en byrclub.com.

Antes que nada, al cambiar de máquina: **`git pull`**.

---

## ⚠️ Migración pendiente: opciones por producto

Hasta que no se corra, la pestaña Menú **no muestra** el desplegable de
opciones (no ofrece algo que no se va a poder guardar). Todo lo demás
funciona igual.

```sql
ALTER TABLE products
  ADD COLUMN option_set VARCHAR(30) DEFAULT NULL AFTER available;
```

(Está también en `api/migrations/2026-08-product-option-set.sql`.)

Correrla **no cambia nada por sí sola**: `NULL` significa "lo que diga la
categoría", que es el comportamiento de siempre. Los productos empiezan a
comportarse distinto sólo cuando vos les elegís algo en el panel.

---

## ⚠️ Para prender el 2x1 por la web (dos pasos, los hacés vos)

Está desplegado y **apagado**. Queda así hasta que hagas estas dos cosas —
podés hacerlas hoy o el miércoles que viene, sin depender de un deploy.

**1. La migración** (phpMyAdmin → base `u932188446_byrclub` → pestaña SQL).
Crea el producto del 2x1, desactivado:

```sql
INSERT INTO products (slug, category, name, description, emoji, price, sort, available)
VALUES ('promo-2x1-doble-cheese', 'promos', '2x1 Doble Cheese con papas',
        'Dos Doble con Cheddar y dos porciones de papas, al precio de una. Beneficio de socio, solo los miércoles.',
        '🍔', 16000, 5, 0);
```

(Está también en `api/migrations/2026-08-perk-2x1-web.sql`, con el
`ON DUPLICATE KEY` por si hay que correrla dos veces.)

**2. La bandera**, en `api/config.php` **del servidor**:

```php
'perk_2x1_web' => true,
```

> **`api/config.php` no está en el repo ni se sube con el deploy** (está
> excluido a propósito, porque tiene las claves de la base). Hay que
> editarlo desde el Administrador de archivos de Hostinger o por FTP.
> Justamente por eso sirve como interruptor: lo prendés y lo apagás sin
> tocar el código ni esperar a GitHub.

Con las dos hechas, el 2x1 aparece **primero en la carta**, con su cintita
dorada, sólo los miércoles y sólo a socios que no lo usaron.

**Para apagarlo:** poné la bandera en `false`. Los pedidos ya hechos no se
tocan.

---

## ✅ Otras migraciones: no hay ninguna pendiente

Las tres que estaban esperando se corrieron el **26 de agosto de 2026**:

- `2026-08-memory-daily.sql` — límite diario del Memotest
- `2026-08-scratch-daily.sql` — límite diario de la Raspadita
- `2026-08-payment-pref.sql` — cómo paga el cliente

Y las de la sesión del local ya estaban: `2026-08-print-jobs.sql` y
`2026-08-delivery-fee.sql`.

> El trabajo del estado en el servidor no necesitó migración: lo que agregó
> (`missions`, `progress`) vive dentro del JSON de `users.state`.

---

## Sesión del 27 de agosto de 2026 (desde casa)

### Contador de entregas para pagarle al delivery

Al cerrar hay que contar cuántos envíos hizo el delivery y multiplicarlos por
lo que se le paga por viaje. El único número parecido era el de "Delivery vs.
retiro", que **no servía para eso**: contaba por día de calendario, así que se
reiniciaba a las 21:00 y partía el turno al medio.

En el panel, pestaña **Pedidos**, hay ahora un bloque **🛵 Pago al delivery**
con la cuenta hecha:

```
🛵 Viajes de la jornada        7
7 × $490                  $3.430
Fijo del día             $15.000
─────────────────────────────────
A pagar                  $18.430
```

Debajo va la **lista de los viajes** (hora, pedido, cliente, dirección) para
poder repasarla con él si hace falta.

**La jornada va de 6 de la mañana a 6 de la mañana**, no de medianoche a
medianoche. Un pedido de las 00:20 del sábado se le cuenta al **viernes**, que
es el turno en el que trabajó. A las 6 de la mañana no hay nadie laburando, así
que el corte nunca parte un servicio. Si contás a la una de la mañana, el
bloque ya te muestra la jornada correcta sin tocar nada.

**Cuenta las entregas hechas, no las pedidas:** los pedidos cancelados quedan
afuera, porque por un pedido cancelado nadie salió a la calle. Y entran tanto
los pedidos web como los cargados en el mostrador para mandar: lo que define un
viaje es que la comida salga en moto, no de dónde vino el pedido.

**Las dos tarifas** (por viaje y fijo del día) se escriben ahí mismo y quedan
guardadas en ese navegador. No están en `config.php` a propósito: cambian
seguido y no tienen por qué esperar un deploy ni entrar por FTP. Lo que cuenta
el servidor —cuántos viajes hubo— no depende de ellas.

> **Si los envíos cobrados no dan lo mismo que cantidad × tarifa, te avisa.**
> Puede pasar si cambió el precio del envío en el medio de la jornada, o si
> algún viaje salió sin cobrarlo. Es mejor verlo que arrastrar la diferencia a
> la cuenta.

Con las flechas **← →** se mira cualquier jornada anterior.

### Las horas estaban 3 adelantadas en toda la web

Reportado: entró un pedido 20:33 y el panel decía **23:33**. Era cierto, y no
era sólo el panel.

**La causa.** El hosting corre en **UTC**, tres horas adelante de Argentina.
La base guarda ahí (`created_at`, `NOW()`, todo), y **nadie fijaba la zona
horaria en ningún lado**. Cada parte del código que necesitaba la hora se la
arreglaba sola — el horario de pedidos y el 2x1 lo hacían bien, con la zona
puesta a mano — y las que se olvidaban mostraban la hora del servidor como si
fuera la de acá.

Ahora hay **una sola regla**, escrita en `api/helpers.php`:

- **PHP piensa en hora de Argentina** (`date_default_timezone_set`).
- **La base sigue guardando en su reloj**, que es UTC. Eso no se tocó: cambiarlo
  obligaría a migrar todas las filas viejas y dejaría la columna con dos
  relojes mezclados.
- **Para mostrar una fecha de la base se pasa por `byr_dt_local()`.**

> El servidor le **pregunta a la base** cuánto adelanta respecto de UTC, en vez
> de darlo por sentado. Hoy Hostinger la tiene en UTC; si algún día la mueven,
> las horas siguen saliendo bien sin tocar una línea.

**Lo que estaba mal, además del pedido:**

- **La comanda impresa** salía con la misma hora de más.
- **Las estadísticas de "Hoy"** se reiniciaban a las **21:00** — o sea en el
  medio del turno, porque a esa hora ya era el día siguiente en UTC.
- **El límite diario de los juegos** (ruleta, raspadita, memotest) y **la
  racha** cambiaban de día también a las 21:00: quien jugaba a las 22 tenía
  otra partida gratis.
- **El "ya lo usó hoy" del 2x1** en el mostrador tenía el mismo corte de las
  21:00 — justo cuando importa saberlo.
- **Los vales** (`Mis cupones`) mostraban el vencimiento 3 horas más tarde, y
  cerca de medianoche con el día cambiado.

**Y uno que apareció buscando esto:** el 2x1 guardaba sus vales con la fecha
en hora de Argentina, dentro de una tabla donde todo lo demás está en UTC. Era
coherente para contar el día, pero **no** para el vencimiento, que se compara
contra `NOW()`: **el código del 2x1 se moría a las 21 horas en vez de a las
24.** Ahora lo guarda con `NOW()` como todos los demás vales.

**Cómo se muestra ahora.** El servidor manda la hora **ya formateada**
(`createdAtLabel`, `openedAtLabel`, `expiresAtLabel`…) y el navegador la
imprime tal cual. Es el mismo patrón que ya usaba el Prode con `kickoffLabel`.
El navegador ya no hace cuentas de husos, que es donde se colaba el error.

> **El horario para pedir no estaba mal**: ése ya calculaba en hora de
> Argentina (por eso el pedido de las 20:33 entró). Es de **19:40 a 23:30**,
> no de 20:00 — se cambia con `'order_hours' => ['20:00', '23:30']` en el
> `api/config.php` **del servidor**.

### Prode: pegar la fecha entera en vez de cargarla partido por partido

Cargar una fecha eran cinco campos por partido, catorce veces. Ahora en el
panel (pestaña **⚽ Prode**) hay un bloque **📥 Pegar la fecha entera**: se
pega la lista tal como viene y el servidor la interpreta.

**Va en dos pasos, a propósito.** **Revisar** no toca nada: muestra cómo
entendió cada línea, una por una. Recién con eso a la vista aparece el botón
de cargar. Pegar catorce partidos a ciegas y que entren mal es peor que
cargarlos a mano.

**Si una línea queda mal, no se carga ninguna.** Media fecha cargada obliga a
revisar uno por uno cuál entró. Se corrige esa línea y se vuelve a pegar la
lista entera: los que ya estaban se saltean solos, así que pegar dos veces no
duplica nada.

**Formatos que entiende** (el día y la hora, en cualquier orden en la línea):

- Día: `30/08`, `30 de agosto`, `2026-08-30`. Una línea que sea **sólo** un
  día (*Sábado 30/08*) le pone esa fecha a todas las de abajo.
- Hora: `21:00`, `21h30`, `21hs`. **El punto no** (`21.00`): choca con las
  fechas escritas `30.08`, y preferimos que te avise antes que cargar el día
  equivocado sin que nadie se entere.
- Equipos: `vs`, `-` o `|`. Las viñetas y la numeración (`1)`, `-`) se
  ignoran solas.

Todo en **hora de Argentina**, y se guarda en UTC como la carga de a uno. Los
escudos se buscan igual que siempre; si un equipo no está en `prode_teams`, el
partido entra igual sin escudo.

> **El guion sin año no se lee como fecha.** `Lanus 2-1 Platense` se leería
> como "2 de enero" y el partido entraría con el día cambiado sin aviso. Con
> guion hay que poner el año (`30-08-2026`); para la forma corta van la barra
> o el punto, que es como viene el fixture.

La carga de a un partido **sigue estando**, para agregar uno suelto o
corregir.

### El mostrador ahora puede mandar el pedido a domicilio

Hasta ahora toda venta de mostrador se guardaba como "se lo lleva", sin
excepción. Pero el que viene al local no siempre se lo lleva: a veces pide,
paga y quiere que se lo mandemos. Eso no se podía cargar.

Arriba del checkout del mostrador hay ahora un selector **🛍️ Se lo lleva /
🛵 Delivery** — el mismo que ve el cliente en la web, pero lo toca el cajero.
Si elige delivery aparecen **dirección** (obligatoria) y **WhatsApp**
(opcional), y el envío se suma al total.

**No hizo falta ninguna migración.** Las columnas ya existían todas
(`fulfillment`, `address`, `customer_phone`, `shipping_cost`): lo único que
pasaba es que `pos-sale.php` escribía `"pickup"` fijo. Ahora escribe lo que
eligió el cajero y valida la dirección del lado del servidor, no sólo en el
navegador.

**El envío es el mismo $490 de la web**, con la misma regla de siempre: se
congela en el pedido, y **no suma puntos** (los puntos salen de la comida).
En la caja entra el total con envío incluido, y el vuelto se calcula sobre
ese número — antes se calculaba sobre la comida sola, que ahora daría mal.

**Tres cosas que había que arreglar alrededor, o el delivery de mostrador
quedaba a medias:**

- **La comanda decía sólo `MOSTRADOR`.** Ahora dice `MOSTRADOR - DELIVERY` y
  sale con la dirección. Si no, el que la prepara la dejaba en la barra
  esperando a alguien que no iba a venir a buscarla.
- **La comanda no decía que ya estaba pagado.** Ahora sale
  `YA PAGO EN EL LOCAL - $X - NO COBRAR`. El que reparte lleva comida ya
  cobrada en la caja; sin ese renglón le cobra de nuevo a alguien que pagó.
- **No aparecía en el panel.** La lista de pedidos arrancaba con un `JOIN` a
  `users`, así que todo lo de consumidor final quedaba afuera de rebote —
  incluido un delivery cargado en el mostrador, que es justo lo que hay que
  despachar y seguir. Ahora el `JOIN` es `LEFT` y la regla se escribió a
  propósito: **la venta de mostrador entra a la lista sólo si es delivery**
  (o si tiene socio, como antes). Las que el cliente se lleva siguen sin
  aparecer: ya están cobradas y entregadas, y llenarían "En curso" de
  pedidos que nadie va a cerrar.

**En las estadísticas cuenta como delivery, no como mostrador.** Lo que
separa los tres números es cómo sale la comida: si sale una moto y se cobra
envío, es un delivery, lo haya cargado el cajero o el cliente. "Mostrador"
queda para lo que se lleva el que está parado en el local.

> **Lo que NO se agregó: "comer en el local".** El selector tiene dos
> opciones, no tres, porque son las dos que pediste. Si algún día querés
> separar *para llevar* de *comer acá*, eso sí necesita una migración
> chica (agregarle un valor al ENUM `fulfillment`).

---

## Sesión del 26 de agosto de 2026 (desde casa)

### El 2x1 de los miércoles, ahora también por la web (prueba piloto)

Antes el 2x1 era un solo camino: el socio reclamaba un código y lo mostraba
en el local. Ahora puede además **pedirlo desde la web** — sumarlo a un
pedido o pedir sólo eso.

**Cómo se hizo, y por qué así.** No hubo que inventar un motor de
descuentos que modifique totales (eso habría tocado caja, comandas, puntos
y devoluciones). En tu carta **las promos ya son productos**:

```
promo-3x2-doble-cheese   "3x2 Doble Cheese"    $32.000
promo-3x2-crispy-onion   "3x2 Crispy Onion"    $35.000
```

Así que el 2x1 es un producto más: `promo-2x1-doble-cheese`, **$16.000**,
que entrega dos Doble con Cheddar y dos porciones de papas. Es la misma
lógica que tu 3x2 (cobrás dos burgers, entregás tres con sus papas). La
comanda sale con el nombre completo y la cocina entiende igual que siempre.

**Los dos caminos comparten el mismo límite.** Uno por socio por miércoles,
sea por la web o por el código. Quien lo pidió online no puede además
reclamar el código, y al revés — el control vive en `redemptions`, que ya
era donde vivía.

**Dónde se decide.** El producto está en la base con `available = 0`, así
que el menú normal **nunca** lo trae. `api/menu.php` lo agrega a mano sólo
si: bandera encendida + miércoles en Argentina + socio logueado + no lo usó
hoy. Y `api/orders/create.php` **vuelve a comprobar las cuatro** antes de
aceptar el pedido: la carta es una comodidad, la puerta es el servidor.


**Nadie lo usa dos veces, y el mostrador se entera.** Es el punto que
importa del piloto: el socio que ya lo pidió por la web no puede después
venir al local a pedirlo.

- El vale del pedido web se guarda con **su propio `prize_id`**
  (`2x1-wed-web`), y su etiqueta dice *"usado en el pedido web #123"*.
- Si el cliente igual trae ese código al mostrador, el panel no dice un
  genérico "ya canjeado": dice **"YA USÓ su 2x1 de hoy: lo pidió por la
  web. No corresponde dárselo de nuevo."** Y no ofrece el botón de canjear.
- **El caso más común es el que no tiene código:** el cliente que llega y
  dice "quiero mi 2x1". Ahora la ficha del socio (buscarlo por email o
  WhatsApp, en el panel o en el mostrador) muestra el estado del 2x1 de
  hoy: disponible, ya usado por la web, o código reclamado sin canjear.
- Cruzado en las dos direcciones: quien reclamó el código no puede pedir
  por la web, y quien pidió por la web no puede reclamar el código.

**Si el local cancela el pedido, el 2x1 vuelve.** Sin eso, pedirlo y que te
lo cancelen te dejaba sin beneficio hasta el miércoles siguiente.

**Un invitado no lo puede pedir.** Es un beneficio de socio, y hace falta
saber quién es para que el límite semanal signifique algo.


**Reclamar el código no gasta el beneficio.** Al principio sí: el límite
contaba *que existiera* el vale, así que tocar "activar el 2x1" en
Beneficios —aunque fuera para mirar, sin ir nunca al local— te sacaba el
2x1 de la carta hasta el miércoles siguiente. Se pasaba de estricto:
castigaba un clic de curiosidad como si fuera un canje.

Ahora se distingue **reclamado** de **usado**:

| Estado | ¿Puede pedirlo por la web? |
|---|---|
| No reclamó nada | Sí |
| Reclamó el código, **sin canjear** | **Sí** — al pedirlo, ese código se anula |
| Ya lo canjeó en el local | No |
| Ya lo pidió por la web | No |

Cuando el socio tenía un código reclamado y termina pidiendo online, el
pedido **reusa esa misma fila** en vez de crear otra. Así el código que
tiene en la mano sigue existiendo, y si lo muestra en el local el
mostrador le dice *"ya lo usaste por la web"* — en vez de *"ese código no
existe"*, que confundiría a los dos.

> **El código del 2x1 no se adjunta a un pedido web.** Aparecía en el
> selector de cupones del checkout junto con los demás vales, pero
> adjuntarlo no cambiaba nada del pedido: se consumía el beneficio y el
> total salía igual. Ahora el checkout no lo ofrece, y si igual se manda,
> el servidor lo rechaza. Son dos caminos distintos a propósito: **el
> código es para el local, el producto es para la web.**


### Raspadita — el premio lo sortea el servidor

Bug reportado: **raspabas, no reclamabas, refrescabas y volvías a jugar.**
Era cierto, y bastante peor de lo que parecía.

La marca de "ya jugué hoy" se escribía **dentro de `claimPrize()`**, o sea
recién al reclamar. Si no reclamabas, no se escribía nada. Y como el premio
se sorteaba **en el navegador**, cada carga de la página sorteaba de nuevo:
refrescando hasta que saliera el Cheese Burger, la raspadita dejaba de ser
un sorteo y pasaba a ser un menú.

Aun reclamando, el límite vivía en `localStorage`: borrando los datos del
navegador se volvía a jugar. Los **vales canjeables** ya estaban topeados a
uno por día, así que papas/bebida/sorpresa/cheeseburger no se podían
farmear — pero los **puntos** sí, sin límite.

Ahora funciona como la ruleta y el memotest:

- `users.last_scratch_play` guarda la fecha de la última raspadita.
- `api/scratch/catalog.php` tiene la tabla de premios y sus pesos. Es la
  única fuente de verdad; el navegador ya no tiene catálogo propio.
- `api/scratch/status.php` (GET) dice si la raspadita de hoy sigue
  disponible y, si ya se jugó, **cuál fue el premio** — así refrescar
  repinta el mismo cartón (con su código) en vez de repartir otro.
- `api/scratch/play.php` (POST) se llama **una sola vez, en el primer
  raspón**: sortea, marca el día, acredita puntos/XP y emite el vale.
  Corre dentro de una transacción con la fila del usuario bloqueada, así
  que disparar dos peticiones a la vez tampoco cobra dos veces.
- El botón **Reclamar premio** ya no otorga nada: es el festejo. Abre el
  overlay con el premio y el código. Se puede tocar de nuevo para volver a
  ver el código del día.
- Se borró `api/redemptions/create.php`. Quedó sin usar, y dejarlo puesto
  reabría el mismo agujero por otra puerta: cualquiera logueado podía
  pedirle un vale de Cheese Burger sin jugar.

**Lo que el arreglo NO cubre:** `api/state.php` sigue guardando el estado
que le manda el navegador (está escrito así desde el principio, y lo dice
su propio comentario). Alguien que sepa abrir la consola puede mandarse
puntos directamente, sin pasar por ningún juego. Esta sesión cerró el
agujero que encuentra un usuario normal — refrescar la página —, no ese.
Cerrarlo del todo es rehacer el state-sync para que el servidor sea dueño
del estado: es un trabajo grande y toca todos los juegos, no solo este.

### El "2x puntos" ahora hace algo (antes no hacía nada)

Reportado por un socio: canjeaba el 2x puntos de la ruleta y no pasaba
nada. Era cierto, y el multiplicador **no estaba implementado en ningún
lado**. Los tres caminos posibles:

| Camino | Qué hacía |
|---|---|
| Pedido online con el cupón adjunto | Lo marcaba usado y acreditaba los puntos normales |
| Mostrador (POS) | Ni siquiera aceptaba cupones — no había dónde ponerlo |
| Validar el código suelto en el panel | Lo marcaba canjeado y mostraba la etiqueta |

La ruleta venía repartiendo una promesa que nadie cumplía.

**Qué se hizo:**

- `BYR_POINT_MULTIPLIERS` en `api/helpers.php` es la tabla de cupones que
  *modifican la acreditación* en vez de entregar algo. Hoy tiene uno solo.
- `byr_redeem_coupon()` canjea un vale de forma atómica y devuelve qué
  era, con su multiplicador. Los vales normales (papas, bebida) devuelven
  1, así que quien llama multiplica siempre sin preguntar.
- En `orders-confirm.php` el canje se movió **antes** de acreditar. Ése
  era literalmente el bug: estaba después, así que el cupón se consumía y
  el socio cobraba lo mismo de siempre.
- El **mostrador ahora acepta cupones**. Aparece un campo cuando se
  identifica al socio (un vale es de alguien; con consumidor final no
  tiene sentido). Sirve para cualquier vale, no sólo el 2x: el cajero
  puede canjear las papas gratis mientras cobra.

**En pantalla:** el panel avisa **antes** de confirmar que el cupón
multiplica, y **después** explica la cuenta (`180 → 360`). Si no, el
cajero ve un número acreditado que no cierra con el sugerido y parece un
error de carga.

> **El 2x puntos sigue siendo el premio más flojo de la ruleta.** Con la
> tasa actual (1 punto cada $100 de comida), duplicar un pedido de
> $10.000 son **+100 puntos** — y una Coca-Cola cuesta 500. Al lado de
> "papas gratis", que es comida en la mano, decepciona. Ahora funciona,
> pero si el comentario se repite, el problema es cuánto da, no que esté
> roto. Se sube cambiando el 2 por otro número en la tabla.

### De paso, dos cosas que estaban mal ahí cerca

- `orders-confirm.php` y `pos-sale.php` no chequeaban que el estado del
  socio fuera un array antes de acreditar. Con un JSON corrupto en la
  base, el endpoint reventaba en vez de recuperarse.
- Ninguno de los dos sembraba las cuentas viejas ni recalculaba logros.
  Una compra que te cruzaba los 1.000 puntos no destrababa el logro hasta
  la próxima vez que abrías la app. Ahora los dos hacen lo mismo que los
  juegos: sembrar antes de acreditar, evaluar después.

### El estado pasó a ser del servidor (la causa de fondo)

Hasta ahora `api/state.php` guardaba **el estado que le mandara el
navegador**. Ésa era la razón de fondo por la que se podían acreditar
puntos sin jugar a nada: un `POST` desde la consola con los puntos que
uno quisiera y listo. Y como `api/ranking.php` arma la tabla leyendo ese
mismo estado, **el ranking era forjable con un `curl`**.

Arreglar la raspadita, la ruleta y el memotest por separado no tapaba
esto: era una puerta aparte, y estaba abierta.

Ahora hay una línea clara:

- **Del servidor** (el navegador no los puede tocar por ninguna vía):
  puntos, XP, inventario, logros, historial, misiones y la racha.
- **Del cliente**: el nombre y el avatar. Nada más.

Lo que llegue por `POST` fuera de esa lista se ignora en silencio.

**`BYRUser` perdió sus métodos de acreditar.** Ya no existen
`addPoints()`, `addXp()`, `spendPoints()`, `claimPrize()` ni
`registerDailyVisit()`. Quedó una copia de lectura para dibujar la
interfaz y `replaceState()` para ponerse al día con el servidor.

### Logros y misiones: los calcula el servidor

Eran el otro lugar donde el navegador se pagaba solo: los dos motores
llevaban sus contadores en `localStorage` y llamaban a `addPoints()`.
Entre los 17 logros y las 8 misiones había **4.950 puntos de una vez y
570 por día** al alcance de quien supiera editar una clave.

No hicimos la solución obvia (un endpoint `track(evento)` que el cliente
llama), porque se puede spamear 25 veces para desbloquear "Raspador
profesional". En vez de eso, **el servidor recalcula**: las 17 métricas
salen de datos que ya son suyos — su propio historial de acreditaciones,
las fechas de última jugada y la tabla `redemptions`. El cliente no
reporta nada, así que no puede mentir.

- `api/progress/catalog.php` — los 17 logros y las 8 misiones, generados
  desde los `.js` para que no haya errores de transcripción.
- `api/progress/engine.php` — métricas, racha, selección de las 3
  misiones del día (con la fecha como semilla: las mismas para todos) y
  el evaluador.
- `api/progress/sync.php` — corre al abrir cualquier página del club.
  Es idempotente: sólo acredita lo que todavía no estaba acreditado.

Los juegos también lo llaman al terminar, así que el logro cae junto con
los puntos de la partida en vez de esperar a la próxima carga.

`achievement-engine.js` y `mission-engine.js` quedaron como **vista**:
leen lo que devuelve el servidor y dibujan. Los nombres, iconos y
descripciones siguen saliendo de los catálogos del navegador.

> **Ojo con las recompensas:** ahora están en dos lados. Si cambiás
> cuántos puntos da un logro, hay que tocar `assets/core/achievements.js`
> (lo que se muestra) **y** `api/progress/catalog.php` (lo que se paga).

### Las cuentas que ya existían no cobran dos veces

El motor viejo guardaba los logros desbloqueados en **su propio**
`localStorage`, no en el estado — pero los puntos sí los acreditaba, y
ésos llegaban al servidor. O sea que las cuentas que ya existen cobraron
logros de los que no quedó rastro. Si el evaluador nuevo los viera como
pendientes, **los pagaría por segunda vez**: miles de puntos regalados.

Así que la primera vez que corre para una cuenta **con historial**, da
por desbloqueado todo lo que ya cumple, en silencio y sin pagar. No se le
saca nada a nadie: los puntos que tiene se los queda, y de ahí en
adelante sólo cobra lo que gane de verdad. Las cuentas nuevas no tienen
historial, así que arrancan cobrando normalmente.

### El canje de beneficios ahora existe de verdad

Esto salió a la luz de paso, y no lo sabíamos: **el canje no generaba
ningún vale.** `beneficios.js` restaba los puntos en el navegador, ponía
"✓ ¡Canjeado!" y ahí terminaba. No quedaba nada en la base, el admin no
tenía qué validar y el socio no tenía qué mostrar en el local. Un Cheese
Burger de 1.800 puntos se canjeaba contra la nada — y al recargar la
página los puntos volvían.

Ahora funciona como los premios de la ruleta: `api/perks/redeem.php`
cobra los puntos y emite un vale con código único en `redemptions`, que
se valida desde el panel igual que los demás. El precio y el nivel los
pone el servidor (`api/perks/catalog.php`), no el HTML: cambiar el
`data-points` desde la consola no abarata nada. Los vales de canje duran
**7 días** en vez de 24 horas, porque no es lo mismo un premio regalado
que algo que costó 8.000 puntos.

> Los precios están en dos lados: `beneficios.html` los muestra,
> `api/perks/catalog.php` los cobra.

### Detalles menores que salieron en el camino

- `storage.js` arrancaba con **350 puntos y 840 XP de regalo** (quedaron
  de la maqueta). No llegaban a ningún lado, pero se veían un instante en
  el HUD antes de que llegara la respuesta del servidor. Ahora arranca en
  cero.
- La racha la lleva el servidor. `streak.js` quedó mostrando ese número;
  el calendario de días visitados sigue siendo local, porque es
  decoración y no vale puntos.
- `assets/core/prizes.js` quedó sin uso (era la tabla que consultaba
  `claimPrize`). Le dejamos una advertencia arriba para que nadie lo
  vuelva a atar a los puntos.

### Qué queda abierto

- **El historial del estado crece sin tope.** El evaluador cuenta las
  partidas recorriéndolo, así que con los años se va a poner pesado.
  Todavía falta mucho para que moleste, pero conviene tenerlo anotado:
  el día que se recorte, hay que guardar los contadores aparte primero.
- **Las cuentas que ya venían forjadas siguen forjadas.** Si alguien se
  puso puntos con la consola antes de este cambio, esos puntos quedaron.
  Cerramos la puerta; no revisamos quién entró. Se puede corregir a mano
  desde el panel de admin.

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

## Para probar las horas (2 minutos, apenas entre un pedido)

1. **Lo reportado:** que entre un pedido y que el panel diga **la hora del
   reloj de la pared**, no tres más.
2. **La comanda impresa** de ese pedido tiene que decir la misma hora.
3. **Mis cupones** (en el perfil): la fecha de un vale tiene que coincidir con
   el día real, sobre todo si lo sacaste después de las 21.
4. **La prueba que sólo se puede hacer de noche:** mirá las estadísticas
   (abajo de los pedidos) **después de las 21:00**. El número de "Hoy" tiene
   que seguir sumando los pedidos del turno, no arrancar de cero.
5. **Los juegos:** jugá la raspadita después de las 22 y volvé a entrar. Tiene
   que decir *"ya jugaste hoy"* hasta la medianoche de verdad, no dejarte
   jugar de nuevo.

## Para probar la carga de la fecha del Prode (se puede desde casa)

1. Panel → **⚽ Prode** → **📥 Pegar la fecha entera**. Ponele un nombre
   (ej. *Fecha de prueba*) y pegá esto tal cual:

   ```
   Sábado 30/08
   19:15  Racing vs Independiente
   21:00  Boca Juniors vs River Plate
   Domingo 31/08
   17:00  Talleres - Belgrano
   ```

2. Tocá **Revisar**. Tienen que salir 2 líneas de día y **3 partidos**, con
   el horario ya resuelto. **Todavía no se cargó nada.**
3. Tocá **Cargar 3 partidos**. Te tiene que dar el **ID de la fecha**, y ese
   ID queda puesto solo en los dos bloques de resultados de más abajo.
4. **La prueba que importa:** volvé a tocar **Revisar** con la misma lista.
   Los tres tienen que salir como **repetidos (se saltean)** y el botón de
   cargar no tiene que aparecer. Si en vez de eso se cargan de nuevo, avisá.
5. Agregá una línea mal a propósito (`Lanus 2-1 Platense`) y revisá: tiene
   que marcarla en rojo y decir que así no se carga **ninguno**.
6. Entrá a **prodes.html** y mirá que los tres partidos se vean con el día y
   la hora correctos.
7. Cuando termines, borrá la fecha de prueba desde phpMyAdmin (`prode_matches`
   y `prode_rounds`).

## Para probar el delivery de mostrador (hace falta estar en el local)

Necesita la **caja abierta** y, para que salga la comanda, la impresora
prendida. Desde casa se puede probar todo menos el papel.

1. Abrí **Mostrador**, armá una venta y elegí **🛵 Delivery**. Tienen que
   aparecer dirección y WhatsApp, y el total tiene que subir **$490**.
2. Tocá **Cobrar** sin poner dirección: no tiene que dejar.
3. Pagá con efectivo poniendo `$20.000`: el **vuelto** tiene que descontar
   también el envío (comida + 490), no sólo la comida.
4. Cobrala. El cartel de la venta tiene que decir **🛵 Delivery** con la
   dirección, y el resumen tiene que mostrar la línea de **Envío**.
5. **La comanda impresa** tiene que decir arriba `MOSTRADOR - DELIVERY`, con
   la dirección debajo y el renglón **`YA PAGO EN EL LOCAL - $X - NO COBRAR`**.
6. Andá al **panel → pedidos**: esa venta tiene que **aparecer en la lista**
   (aunque sea consumidor final) para poder marcarla en camino y entregada.
7. Volvé al mostrador y tocá **Nueva venta**: la entrega tiene que volver a
   "se lo lleva" y la dirección tiene que estar vacía. (Si se arrastrara, la
   próxima venta saldría a la dirección del cliente anterior.)
8. Hacé una venta normal (**🛍️ Se lo lleva**): sin envío, sin dirección, la
   comanda dice `MOSTRADOR` como siempre, y **no** aparece en la lista del
   panel — igual que antes.
9. En **estadísticas** (abajo de los pedidos), la venta del punto 4 tiene que
   sumar en **delivery**, no en mostrador.

## Para probar el 2x1 por la web

Con la migración corrida y la bandera en `true`, **siendo miércoles**:

1. Entrá a **Pedir** con tu cuenta. El 2x1 tiene que aparecer **primero**,
   con la cintita dorada y $16.000.
2. Sumalo y hacé el pedido (solo, o con otras cosas).
3. Volvé a **Pedir**: ya no tiene que estar. Lo usaste.
4. Andá a **Beneficios** e intentá reclamar el código del 2x1: tiene que
   decir que ya lo usaste en un pedido web. **Ése es el chequeo que
   importa** — que los dos caminos compartan el límite.
5. Cancelá ese pedido desde el panel y volvé a **Pedir**: el 2x1 tiene que
   volver a aparecer.

**La prueba que más importa — que no se pueda usar dos veces:**

1. Pedí el 2x1 por la web.
2. En el panel (o en el mostrador), buscá tu propio socio por email. Tiene
   que decir **"Ya usó su 2x1 de hoy: lo pidió por la web"**.
3. Andá a **Mis cupones**, copiá el código de ese 2x1 y ponelo en el
   validador del panel. Tiene que decir **"YA USÓ su 2x1 de hoy: lo pidió
   por la web. No corresponde dárselo de nuevo"** — y no darte el botón de
   canjear.
4. En **Beneficios**, intentá reclamar el código del 2x1: tiene que decir
   que ya lo usaste en un pedido web.

Y al revés: reclamá el código primero (sin usarlo), y después intentá
pedirlo por la web. No tiene que aparecer en la carta.

**Y los casos que NO tienen que dejar:**

- Un jueves: no aparece (y si alguien fuerza el pedido, el servidor lo
  rechaza con "el 2x1 de socio es solo los miércoles").
- Sin loguearse (pedido de invitado): no aparece ni se puede pedir.
- Con la bandera en `false`: no aparece, aunque sea miércoles.

## Para probar el 2x puntos (necesitás uno en la ruleta)

**En el mostrador** (es el camino nuevo entero):

1. Abrí la caja y armá una venta.
2. Buscá al socio por email o WhatsApp → aparece el campo **Cupón**.
3. Pegá el código del 2x puntos y cobrá.
4. El resumen tiene que mostrar `🎟️ Cupón: 2x puntos` y los puntos con
   `(x2 por el cupón)` — el doble de lo normal.
5. Probá también un cupón que no sea de ese socio: tiene que rechazarlo
   sin cobrar la venta.

**En un pedido online:**

1. Al pedir, adjuntá el 2x puntos.
2. En el panel, la tarjeta del pedido tiene que decir **"Multiplica los
   puntos x2"** antes de que confirmes.
3. Al confirmar, el aviso tiene que mostrar la cuenta: `180 → 360`.

**Y el caso que no tiene que cambiar nada:** cobrá con un cupón de papas
gratis. Se marca canjeado y aparece en el resumen, pero los puntos quedan
en el número normal.

## Para probar que el agujero se cerró (5 minutos, desde casa)

**1. El curl que antes te hacía millonario.** Entrá al club logueado,
abrí la consola del navegador (F12) y pegá esto:

```js
await fetch("/api/state.php", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state: { wallet: { points: 999999 }, progression: { xp: 999999 } } })
}).then(r => r.json());
```

Antes te dejaba con 999.999 puntos y primero en el ranking. Ahora tiene
que devolver tu estado **real**, sin tocar. Recargá y confirmá que los
puntos siguen donde estaban.

**2. Los logros no se pueden desbloquear a mano.** En la consola:

```js
localStorage.setItem("byr_achievement_engine_v1", JSON.stringify({ metrics: { scratch: 999 } }));
```

Recargá el perfil. Los logros de raspadita tienen que seguir como
estaban: esa clave ya no la lee nadie (de hecho se borra sola al cargar).

**3. Los logros de verdad sí caen.** Jugá la raspadita. Al terminar
tienen que aparecer los puntos del premio **y** el cartelito de "A
raspar" si es tu primera, con sus 75 puntos aparte.

**4. El canje ahora da un vale.** Andá a Beneficios y canjeá algo que
puedas pagar (la Coca-Cola son 500 puntos). Tiene que:

- descontarte los puntos **y que sigan descontados al recargar**
- mostrarte un **código**
- aparecer en **Mis cupones** dentro del perfil
- poder validarse desde el panel de admin

Antes de este cambio no pasaba nada de eso.

**5. Las misiones del día.** Tienen que ser 3, las mismas en el celular y
en la computadora, y no reiniciarse al borrar los datos del navegador.

## Para probar la raspadita (se puede desde casa)

1. Correr la migración `2026-08-scratch-daily.sql`.
2. Entrar a **Juegos → Raspadita** y raspar el cartón. Tiene que revelar un
   premio y sumar los puntos en el perfil.
3. **La prueba del bug reportado:** raspar hasta que aparezca el premio y
   **no** tocar "Reclamar". Refrescar la página (F5). Tiene que aparecer
   *"Ya jugaste hoy"* con **el mismo premio** ya revelado. Antes de este
   cambio salía un cartón nuevo con otro premio.
4. **La otra prueba:** borrar los datos del sitio en el navegador (o abrir
   una ventana de incógnito) y volver a entrar con la misma cuenta. Mismo
   resultado: el premio de hoy, sin sumar de nuevo.
5. Si toca un premio canjeable, el botón queda como **"Ver mi código"** y
   el código tiene que poder validarse desde el panel de admin.

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
