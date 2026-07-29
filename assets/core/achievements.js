(() => {
  "use strict";

  const achievements = [
    {
      id: "welcome",
      name: "Bienvenido al Club",
      description: "Ingresaste por primera vez a BYR Club.",
      icon: "🍔",
      category: "club",
      target: 1,
      reward: {
        points: 50,
        xp: 25
      }
    },

    {
      id: "first-game",
      name: "Primera partida",
      description: "Jugaste por primera vez en el Arcade BYR.",
      icon: "🎮",
      category: "games",
      target: 1,
      reward: {
        points: 50,
        xp: 30
      }
    },

    {
      id: "first-scratch",
      name: "A raspar",
      description: "Jugaste tu primera raspadita diaria.",
      icon: "🎟️",
      category: "scratch",
      target: 1,
      reward: {
        points: 75,
        xp: 40
      }
    },

    {
      id: "scratch-5",
      name: "Mano afortunada",
      description: "Jugaste 5 raspaditas.",
      icon: "✨",
      category: "scratch",
      target: 5,
      reward: {
        points: 150,
        xp: 80
      }
    },

    {
      id: "scratch-25",
      name: "Raspador profesional",
      description: "Jugaste 25 raspaditas.",
      icon: "🏅",
      category: "scratch",
      target: 25,
      reward: {
        points: 400,
        xp: 200
      }
    },

    {
      id: "first-roulette",
      name: "Que gire la suerte",
      description: "Giraste la ruleta por primera vez.",
      icon: "🎡",
      category: "roulette",
      target: 1,
      reward: {
        points: 75,
        xp: 40
      }
    },

    {
      id: "roulette-10",
      name: "Fan de la ruleta",
      description: "Giraste la ruleta 10 veces.",
      icon: "🎯",
      category: "roulette",
      target: 10,
      reward: {
        points: 250,
        xp: 125
      }
    },

    {
      id: "points-1000",
      name: "Primer millar",
      description: "Alcanzaste 1.000 puntos acumulados.",
      icon: "🪙",
      category: "points",
      target: 1000,
      reward: {
        points: 100,
        xp: 100
      }
    },

    {
      id: "points-5000",
      name: "Cazador de puntos",
      description: "Alcanzaste 5.000 puntos acumulados.",
      icon: "💰",
      category: "points",
      target: 5000,
      reward: {
        points: 500,
        xp: 300
      }
    },

    {
      id: "level-3",
      name: "Fan de BYR",
      description: "Alcanzaste el rango Fan.",
      icon: "⭐",
      category: "level",
      target: 3,
      reward: {
        points: 200,
        xp: 100
      }
    },

    {
      id: "level-5",
      name: "Experto BYR",
      description: "Alcanzaste el rango Experto.",
      icon: "🔥",
      category: "level",
      target: 5,
      reward: {
        points: 350,
        xp: 175
      }
    },

    {
      id: "level-8",
      name: "Maestro BYR",
      description: "Alcanzaste el rango Maestro.",
      icon: "🏆",
      category: "level",
      target: 8,
      reward: {
        points: 600,
        xp: 300
      }
    },

    {
      id: "level-12",
      name: "Leyenda BYR",
      description: "Alcanzaste el rango Leyenda.",
      icon: "👑",
      category: "level",
      target: 12,
      reward: {
        points: 1000,
        xp: 500
      }
    },

    {
      id: "streak-3",
      name: "Tres días al hilo",
      description: "Visitaste BYR Club durante 3 días consecutivos.",
      icon: "🔥",
      category: "streak",
      target: 3,
      reward: {
        points: 150,
        xp: 100
      }
    },

    {
      id: "streak-7",
      name: "Semana perfecta",
      description: "Visitaste BYR Club durante 7 días consecutivos.",
      icon: "📅",
      category: "streak",
      target: 7,
      reward: {
        points: 400,
        xp: 250
      }
    },

    {
      id: "first-prize",
      name: "Premio desbloqueado",
      description: "Ganaste tu primer premio en BYR Club.",
      icon: "🎁",
      category: "prizes",
      target: 1,
      reward: {
        points: 100,
        xp: 75
      }
    },

    {
      id: "prizes-10",
      name: "Coleccionista",
      description: "Conseguiste 10 premios.",
      icon: "🎒",
      category: "prizes",
      target: 10,
      reward: {
        points: 500,
        xp: 300
      }
    }
  ];

  function getAll() {
    return achievements.map((achievement) => ({
      ...achievement,
      reward: {
        ...achievement.reward
      }
    }));
  }

  function getById(id) {
    if (typeof id !== "string" || !id.trim()) {
      return null;
    }

    const achievement = achievements.find(
      (item) => item.id === id.trim()
    );

    if (!achievement) {
      return null;
    }

    return {
      ...achievement,
      reward: {
        ...achievement.reward
      }
    };
  }

  function getByCategory(category) {
    if (typeof category !== "string") {
      return [];
    }

    return achievements
      .filter((item) => item.category === category)
      .map((achievement) => ({
        ...achievement,
        reward: {
          ...achievement.reward
        }
      }));
  }

  function has(id) {
    return achievements.some(
      (achievement) => achievement.id === id
    );
  }

  window.BYRAchievementRegistry = {
    getAll,
    getById,
    getByCategory,
    has
  };
})();