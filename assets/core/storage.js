(() => {
  "use strict";

  const STORAGE_KEY = "byrclub_user_state_v1";

  const defaultState = {
    profile: {
      name: "Brian",
      avatar: "🍔"
    },
    wallet: {
      points: 350
    },
    progression: {
      xp: 840,
      streak: 1,
      lastVisit: null
    },
    inventory: [],
    achievements: [],
    history: []
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