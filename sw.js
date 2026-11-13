/* =========================================================
   BYR Club — Service worker (app instalable)
   ---------------------------------------------------------
   Reglas, a propósito conservadoras:
   - La API (/api/...) NUNCA pasa por acá: puntos, cupones, pedidos y
     ranking cambian todo el tiempo y la sesión va por cookie.
   - Las páginas (HTML) van SIEMPRE a la red. Solo si no hay internet se
     muestra offline.html. Así nunca se ve una página vieja ni de otro usuario.
   - Lo estático (CSS, JS, imágenes, fuentes del propio sitio) se guarda y se
     sirve rápido mientras se actualiza en segundo plano. El CSS y el JS ya
     vienen versionados (?v=sha) por el deploy, así que un cambio publicado
     estrena dirección y se baja de cero.
   Para forzar que todos tiren el caché viejo: subir CACHE_VERSION.
========================================================= */

const CACHE_VERSION = "byr-v2";
const STATIC_CACHE = CACHE_VERSION + "-static";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/assets/icons/icon-192.png",
  "/assets/logo-byr.png"
];

const STATIC_EXT = /\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp3|wav|ogg)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------------- Avisos (push) ----------------
   El servidor manda { title, body, url, tag } cifrado. Se muestra la
   notificación; al tocarla se abre (o enfoca) la página indicada. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "BYR Club";
  const options = {
    body: data.body || "",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/maskable-192.png",
    data: { url: data.url || "/index.html" },
    lang: "es-AR"
  };
  if (data.tag) {
    options.tag = data.tag;     // mismo tag = reemplaza al aviso anterior (ej. estados de un pedido)
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/index.html", self.location.origin);
  if (target.origin !== self.location.origin) return;  // solo páginas del propio sitio
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(target.href).then((c) => (c || w).focus()).catch(() => w.focus());
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fuentes de Google, etc.: el navegador se encarga
  if (url.pathname.startsWith("/api/")) return;        // la API nunca se toca
  if (url.pathname === "/sw.js") return;

  // Páginas: siempre la red; sin internet, la pantalla offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Estáticos: lo guardado al toque, y se refresca en segundo plano.
  if (STATIC_EXT.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res && res.ok && res.type === "basic") {
                cache.put(req, res.clone());
                // Cada deploy estrena ?v=: borramos las versiones viejas del mismo archivo.
                cache.keys().then((keys) => keys.forEach((k) => {
                  const ku = new URL(k.url);
                  if (ku.pathname === url.pathname && ku.search !== url.search) cache.delete(k);
                }));
              }
              return res;
            })
            .catch(() => cached);
          return cached || fresh;
        })
      )
    );
  }
});
