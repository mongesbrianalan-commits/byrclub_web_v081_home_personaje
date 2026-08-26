(function () {
  "use strict";

  /* =========================================================
     ⚠️ Este catálogo YA NO SE USA para otorgar nada.

     Era la tabla que consultaba BYRUser.claimPrize() para saber
     cuántos puntos valía cada premio y sumárselos al socio desde
     el navegador. Ese método se eliminó: desde que el servidor es
     dueño del estado, quién gana qué y cuánto vale lo deciden
     api/scratch/catalog.php, api/roulette/spin.php y
     api/progress/catalog.php.

     Quedó cargado porque varias páginas lo incluyen. Si vas a
     usarlo para algo, que sea para mostrar — no para acreditar:
     volver a atarlo a los puntos reabre el agujero que cerramos.
     ========================================================= */

  const prizeRegistry = {
    "points-50": {
      points: 50,
      xp: 25
    },

    "points-100": {
      points: 100,
      xp: 35
    },

    "points-250": {
      points: 250,
      xp: 50
    },

    fries: {
      xp: 20,
      inventory: {
        id: "fries",
        label: "Papas gratis",
        icon: "🍟",
        type: "reward"
      }
    },

    drink: {
      xp: 20,
      inventory: {
        id: "drink",
        label: "Bebida gratis",
        icon: "🥤",
        type: "reward"
      }
    },

    surprise: {
      xp: 25,
      inventory: {
        id: "surprise",
        label: "Premio sorpresa",
        icon: "🎁",
        type: "reward"
      }
    },

    "cheese-burger": {
      xp: 35,
      inventory: {
        id: "cheese-burger",
        label: "Cheese Burger gratis",
        icon: "🧀",
        type: "reward"
      }
    },

    "double-points": {
      xp: 30,
      inventory: {
        id: "double-points",
        label: "2x puntos",
        icon: "🍔",
        type: "boost"
      }
    },

    badge: {
      xp: 40,
      achievement: {
        id: "roulette-exclusive-badge",
        label: "Insignia exclusiva",
        icon: "💎"
      }
    }
  };

  function getPrize(id) {
    return prizeRegistry[id] || null;
  }

  function getAllPrizes() {
    return Object.entries(prizeRegistry).map(([id, prize]) => ({
      id,
      ...prize
    }));
  }

  function hasPrize(id) {
    return Object.prototype.hasOwnProperty.call(prizeRegistry, id);
  }

  window.BYRPrizeRegistry = {
    getPrize,
    getAllPrizes,
    hasPrize
  };
})();