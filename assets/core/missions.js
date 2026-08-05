(() => {
  "use strict";

  /*
   * Este archivo contiene únicamente el catálogo.
   * No guarda progreso ni entrega recompensas.
   */

  const missions = [
    {
      id: "daily-visit",
      name: "Presente en el Club",
      description: "Ingresá a BYR Club durante el día.",
      icon: "📅",
      event: "visit",
      target: 1,
      difficulty: "easy",
      reward: {
        points: 25,
        xp: 15
      }
    },

    {
      id: "daily-game",
      name: "Una partida rápida",
      description: "Jugá cualquier juego del Arcade BYR.",
      icon: "🎮",
      event: "game",
      target: 1,
      difficulty: "easy",
      reward: {
        points: 40,
        xp: 25
      }
    },

    {
      id: "daily-roulette",
      name: "Que gire la suerte",
      description: "Realizá un giro en la ruleta.",
      icon: "🎡",
      event: "roulette",
      target: 1,
      difficulty: "easy",
      reward: {
        points: 50,
        xp: 30
      }
    },

    {
      id: "daily-two-games",
      name: "Jugador del día",
      description: "Jugá dos partidas en el Arcade BYR.",
      icon: "🕹️",
      event: "game",
      target: 2,
      difficulty: "medium",
      reward: {
        points: 80,
        xp: 50
      }
    },

    {
      id: "daily-prize",
      name: "Cazador de premios",
      description: "Conseguí un premio durante el día.",
      icon: "🎁",
      event: "prize",
      target: 1,
      difficulty: "medium",
      reward: {
        points: 75,
        xp: 50
      }
    },

    {
      id: "daily-achievement",
      name: "Día de logros",
      description: "Desbloqueá un logro de BYR Club.",
      icon: "🏆",
      event: "achievement",
      target: 1,
      difficulty: "medium",
      reward: {
        points: 100,
        xp: 60
      }
    },

    {
      id: "daily-three-games",
      name: "Maratón BYR",
      description: "Jugá tres partidas durante el día.",
      icon: "🔥",
      event: "game",
      target: 3,
      difficulty: "hard",
      reward: {
        points: 150,
        xp: 90
      }
    }
  ];

  function cloneMission(mission) {
    return {
      ...mission,
      reward: {
        ...mission.reward
      }
    };
  }

  function getAll() {
    return missions.map(cloneMission);
  }

  function getById(id) {
    if (
      typeof id !== "string" ||
      !id.trim()
    ) {
      return null;
    }

    const mission = missions.find(
      (item) => item.id === id.trim()
    );

    return mission
      ? cloneMission(mission)
      : null;
  }

  function getByEvent(eventName) {
    if (typeof eventName !== "string") {
      return [];
    }

    const normalizedEvent =
      eventName.trim().toLowerCase();

    return missions
      .filter(
        (mission) =>
          mission.event === normalizedEvent
      )
      .map(cloneMission);
  }

  function getByDifficulty(difficulty) {
    if (typeof difficulty !== "string") {
      return [];
    }

    const normalizedDifficulty =
      difficulty.trim().toLowerCase();

    return missions
      .filter(
        (mission) =>
          mission.difficulty ===
          normalizedDifficulty
      )
      .map(cloneMission);
  }

  function has(id) {
    return missions.some(
      (mission) => mission.id === id
    );
  }

  window.BYRMissionRegistry = {
    getAll,
    getById,
    getByEvent,
    getByDifficulty,
    has
  };
})();