# Agente de impresión de BYR Club

Programita que corre en la **PC del local** y hace que las comandas y los
tickets salgan solos por la impresora térmica.

## Por qué hace falta

La web (byrclub.com) está en un hosting en internet. Una página web **no puede**
hablarle directo a una impresora que está enchufada en la red del local: no la
ve, y aunque la viera, el navegador no manda ESC/POS.

Entonces el trabajo se parte en dos:

```
[alguien cobra o acepta un pedido]
        │
        ▼
  la web deja la comanda lista en una cola  (tabla print_jobs)
        │
        ▼
  este agente, desde la PC del local, pregunta cada 4 segundos si hay algo
        │
        ▼
  se lo manda a la térmica por TCP 9100  →  sale el papel
```

Ventaja: si la impresora está apagada o sin papel, **el trabajo queda esperando**
y sale cuando se soluciona. No se pierde ninguna comanda ni se traba una venta.

## Instalación (una sola vez, en la PC del local)

1. **Copiar** `config.example.json` y llamarlo **`config.json`**.
2. Abrirlo con el Bloc de notas y completar:
   - `token`: el mismo texto que está en `print_token` dentro de `api/config.php`
     del hosting.
   - `printerIp`: la IP de la térmica. La de BYR Docksud es **192.168.0.250**.
3. Doble clic en **`Probar-impresora.cmd`** → tiene que salir una tirita que dice
   "BYR CLUB / Agente de impresion OK". Si no sale, el problema es la impresora
   o la red, todavía no la web.
4. Doble clic en **`Instalar-inicio.cmd`** → queda arrancando solo cada vez que
   se prende la PC.

Listo. Desde ahí, cada venta de mostrador y cada pedido online aceptado
imprimen la comanda sin que nadie apriete nada.

## Los archivos

| Archivo | Para qué |
|---|---|
| `Probar-impresora.cmd` | Imprime una prueba directo a la térmica, sin pasar por la web. |
| `Iniciar-agente.cmd` | Lo arranca en una ventana donde se ve todo lo que hace. Para revisar problemas. |
| `Instalar-inicio.cmd` | Que arranque solo al prender la PC (sin ventana). |
| `Desinstalar-inicio.cmd` | Lo saca del arranque y cierra el que esté corriendo. |
| `agente.log` | Qué imprimió y qué falló. Se reinicia solo cuando pasa 1 MB. |
| `config.json` | Tu configuración. **No se sube a GitHub** porque tiene el token. |

## Si algo no sale

**No sale nada y nadie se queja.** Abrí `agente.log`. Si dice
`Agente iniciado` y nada más, es que no hay trabajos: probá cobrando una venta.

**"La impresora no responde".** Está apagada, sin papel, o cambió de IP. Para
ver si contesta, desde la PC del local:

```bash
powershell -Command "Test-NetConnection 192.168.0.250 -Port 9100"
```

Si `TcpTestSucceeded` da `False`, el problema es la impresora o la red — la web
no tiene nada que ver.

**"Token de impresión inválido".** El `token` de `config.json` no coincide con
el `print_token` de `api/config.php` en el hosting. Tienen que ser idénticos.

**"Falta correr 2026-08-print-jobs.sql".** Falta crear la tabla de la cola:
entrar a phpMyAdmin y correr `api/migrations/2026-08-print-jobs.sql`.

**Sale con caracteres raros en vez de acentos.** La impresora está en otra tabla
de caracteres. Se cambia en `api/printing.php`, en la línea `ESC t`.

## Cómo cambiar lo que sale impreso

Todo el diseño de la comanda y del ticket está **en el server**, en
`api/printing.php` (funciones `byr_escpos_comanda` y `byr_escpos_ticket`). Se
cambia ahí y ya sale distinto en el local, sin tocar esta PC.
