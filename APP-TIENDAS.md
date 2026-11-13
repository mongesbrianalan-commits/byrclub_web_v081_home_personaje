# BYR Club en App Store y Google Play

La app de las tiendas **muestra la misma web** (byrclub.com). No hay que mantener
dos sistemas: todo lo que se publica en la web aparece en la app.

## Etapa 1 — App instalable (PWA) · HECHA

- `manifest.json` (nombre, colores, íconos y accesos directos a Pedir, Prode y Puntos).
- `sw.js`: el service worker. **Nunca** guarda la API ni las páginas, solo lo
  estático (CSS, JS, imágenes). Sin internet muestra `offline.html`.
- `assets/icons/`: íconos generados del logo (192, 512, maskable, apple-touch, favicon).
- `assets/core/pwa.js` + etiquetas en el `<head>` de todas las páginas.

Ya se puede instalar desde el celular:
- **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a la pantalla principal*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

Si algún día el caché queda trabado: subir `CACHE_VERSION` en `sw.js`.

## Etapa 2 — Google Play (Android) · costo: USD 25, una sola vez

Se hace todo desde Windows, sin programar:

1. Crear la cuenta de desarrollador en <https://play.google.com/console> (USD 25).
   Si es cuenta **personal** nueva, Google pide una prueba cerrada con
   **12 testers durante 14 días** antes de publicar. Con cuenta de **organización**
   (requiere número D-U-N-S de la empresa) no se pide.
2. Entrar a <https://www.pwabuilder.com>, poner `https://byrclub.com` → *Package for stores* → **Android**.
   - Package ID sugerido: `com.byrclub.app`
   - Descarga un `.zip` con el `.aab` (lo que se sube a Play) y la **llave de firma**.
   - **Guardar la llave y su contraseña en un lugar seguro.** Sin ella no se puede actualizar la app nunca más.
3. En Play Console: crear la app, subir el `.aab`, completar ficha (capturas, descripción,
   política de privacidad, clasificación de contenido).
4. Copiar la huella **SHA-256** de *Configuración → Integridad de la app → Firma de apps* y
   pasármela: armo `/.well-known/assetlinks.json` para que la app abra sin la barra del navegador.

## Etapa 3 — App Store (iPhone) · costo: USD 99 por año

1. Cuenta en <https://developer.apple.com/programs/> (USD 99/año).
2. PWABuilder genera también el proyecto de **iOS**, pero para compilarlo y subirlo hace falta
   una **Mac con Xcode** (propia, prestada o alquilada en la nube, ej. MacinCloud), o un servicio
   de build en la nube.
3. **Ojo con el rechazo de Apple (regla 4.2):** Apple rechaza apps que son "solo una web
   adentro de una app". Para pasar el filtro conviene sumar algo propio de la app:
   - **Notificaciones push** (avisos de pedido listo, nueva fecha del Prode, cupones).
   - **Escáner de QR** en el mostrador para canjear cupones.
   Esto se hace antes de mandar a revisión.

## Notificaciones push · HECHO

Avisos al celular con Web Push (sin servicios pagos). Requiere correr
`api/migrations/2026-11-push.sql` una vez. El socio los activa en *Mi perfil* o al enviar un pedido;
salen solos con cada cambio de estado del pedido, y el panel tiene la pestaña *📣 Avisos* para novedades.
En iPhone solo funcionan con la app instalada (iOS 16.4 o más).

## Borrar la cuenta desde la app · HECHO

Apple (regla 5.1.1(v)) y Google piden que el socio pueda borrar su cuenta solo. Está en
*Mi perfil → Borrar mi cuenta* (`perfil.html#borrar-cuenta`, `api/delete-account.php`).
Para la ficha de Google Play, la URL de borrado es `https://byrclub.com/privacidad.html#borrar-cuenta`.

## Política de privacidad

HECHA: `https://byrclub.com/privacidad.html` (es la URL que se carga en las dos tiendas).
