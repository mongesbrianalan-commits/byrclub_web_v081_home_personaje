(() => {
  "use strict";

  const STORAGE_KEY = "byrclub_user_state_v1";

  /* Estado vacío. Es solo la forma que tiene que tener el objeto
     mientras no llegue el del servidor: el estado de verdad lo manda
     /api/me.php al cargar la página.

     Antes esto arrancaba con 350 puntos y 840 XP de regalo (quedaron
     de la maqueta). Con el servidor como dueño del estado, esos
     valores no llegaban a ningún lado, pero se veían un instante en
     el HUD antes de que llegara la respuesta. */
  const defaultState = {
    profile: {
      name: "Socio",
      avatar: "🍔"
    },
    wallet: {
      points: 0
    },
    progression: {
      xp: 0,
      streak: 0,
      lastVisit: null
    },
    inventory: [],
    achievements: [],
    history: [],
    missions: { date: null, completed: [] }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeState(base, stored) {
    return {
      ...base,
      ...stored,
      profile: {
        ...base.profile,
        ...(stored?.profile || {})
      },
      wallet: {
        ...base.wallet,
        ...(stored?.wallet || {})
      },
      progression: {
        ...base.progression,
        ...(stored?.progression || {})
      },
      inventory: Array.isArray(stored?.inventory)
        ? stored.inventory
        : base.inventory,
      achievements: Array.isArray(stored?.achievements)
        ? stored.achievements
        : base.achievements,
      history: Array.isArray(stored?.history)
        ? stored.history
        : base.history
    };
  }

  function load() {
    try {
      const rawState = localStorage.getItem(STORAGE_KEY);

      if (!rawState) {
        const initialState = clone(defaultState);
        save(initialState);
        return initialState;
      }

      const parsedState = JSON.parse(rawState);
      return mergeState(clone(defaultState), parsedState);
    } catch (error) {
      console.error("No se pudo cargar el usuario de BYR Club:", error);

      const fallbackState = clone(defaultState);
      save(fallbackState);

      return fallbackState;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("No se pudo guardar el usuario de BYR Club:", error);
      return false;
    }
  }

  function reset() {
    const initialState = clone(defaultState);
    save(initialState);
    return initialState;
  }

  window.BYRStorage = {
    load,
    save,
    reset,
    key: STORAGE_KEY
  };
})();
