(function () {
  "use strict";

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