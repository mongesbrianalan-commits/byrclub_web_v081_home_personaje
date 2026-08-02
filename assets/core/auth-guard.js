(function () {
  "use strict";

  /* =========================================================
     BYR Club — Guard de páginas protegidas
     ---------------------------------------------------------
     Se carga en el <head> (bloqueante) de las páginas que
     requieren sesión. Si no hay sesión, redirige a la pantalla
     de ingreso ANTES de que se pinte el contenido (sin flash),
     recordando a dónde volver con ?next=.

     No depende de auth.js: lee la clave directamente para
     poder ejecutarse lo antes posible.
  ========================================================= */

  var SESSION_KEY = "byrclub_session_v1";

  var hasSession;
  try {
    hasSession = Boolean(localStorage.getItem(SESSION_KEY));
  } catch (error) {
    /* Si el navegador bloquea el almacenamiento (modo privado,
       etc.), no dejamos a la persona encerrada afuera. */
    return;
  }

  if (hasSession) {
    return;
  }

  /* Los juegos viven en /assets/games/<juego>/, así que para
     llegar a ingresar.html hay que subir tres niveles. */
  var inGame = location.pathname.indexOf("/assets/games/") !== -1;
  var prefix = inGame ? "../../../" : "";

  var next = encodeURIComponent(location.pathname + location.search);

  location.replace(prefix + "ingresar.html?next=" + next);
})();
