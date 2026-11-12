/* BYR Club — registra el service worker (app instalable). Va en todas las
   páginas. Si el navegador no lo soporta, no pasa nada: la web sigue igual. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
      /* sin service worker la web anda igual */
    });
  });
})();
