(() => {
  const HEADER_ID = "byr-user-header";

  function createUserHeader() {
    if (document.getElementById(HEADER_ID)) {
      return null;
    }

    const header = document.createElement("section");

    header.id = HEADER_ID;
    header.className = "byr-user-header";
    header.setAttribute("aria-label", "Estado de tu cuenta BYR Club");

    header.innerHTML = `
      <div class="byr-user-header__inner">

        <a
          href="../../perfil.html"
          class="byr-user-header__profile"
          aria-label="Ir a mi perfil"
        >
          <div class="byr-user-header__avatar">
            <span data-byr-avatar-initial>U</span>
          </div>

          <div class="byr-user-header__identity">
            <span class="byr-user-header__greeting">
              Hola,
            </span>

            <strong
              class="byr-user-header__name"
              data-byr-user-name
            >
              Usuario
            </strong>
          </div>
        </a>

        <div class="byr-user-header__stats">

          <div
            class="byr-user-stat byr-user-stat--points"
            data-byr-points-container
          >
            <span class="byr-user-stat__icon" aria-hidden="true">
              🪙
            </span>

            <div class="byr-user-stat__content">
              <span class="byr-user-stat__label">
                Mis puntos
              </span>

              <strong
                class="byr-user-stat__value"
                data-byr-points
              >
                0
              </strong>
            </div>
          </div>

          <div
            class="byr-user-stat byr-user-stat--level"
            data-byr-level-container
          >
            <span class="byr-user-stat__icon" aria-hidden="true">
              ⭐
            </span>

            <div class="byr-user-stat__content">
              <span class="byr-user-stat__label">
                Nivel
              </span>

              <strong
                class="byr-user-stat__value"
                data-byr-level
              >
                1
              </strong>
            </div>
          </div>

          <div
            class="byr-user-header__progress"
            data-byr-xp-container
          >
            <div class="byr-user-header__progress-top">
              <span>
                Experiencia
              </span>

              <strong>
                <span data-byr-xp>0</span>
                XP
              </strong>
            </div>

            <div
              class="byr-user-header__progress-track"
              role="progressbar"
              aria-label="Progreso de experiencia"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
            >
              <div
                class="byr-user-header__progress-fill"
                data-byr-xp-bar
              ></div>
            </div>
          </div>

        </div>

        <a
          href="../../perfil.html"
          class="byr-user-header__profile-button"
        >
          Ver mi perfil
        </a>

      </div>
    `;

    const siteHeader = document.querySelector(".site-header");
    const main = document.querySelector("main");

    if (siteHeader) {
      siteHeader.insertAdjacentElement("afterend", header);
    } else if (main) {
      main.insertAdjacentElement("beforebegin", header);
    } else {
      document.body.prepend(header);
    }

    return header;
  }

  function getUserState() {
    if (!window.BYRUser?.getState) {
      return null;
    }

    return BYRUser.getState();
  }

  function getUserName(state) {
    return (
      state?.profile?.name ||
      state?.profile?.displayName ||
      state?.name ||
      "Usuario"
    );
  }

  function updateIdentity() {
    const state = getUserState();

    if (!state) {
      return;
    }

    const name = getUserName(state);
    const nameElement = document.querySelector(
      "[data-byr-user-name]"
    );

    const initialElement = document.querySelector(
      "[data-byr-avatar-initial]"
    );

    if (nameElement) {
      nameElement.textContent = name;
    }

    if (initialElement) {
      initialElement.textContent =
        name.trim().charAt(0).toUpperCase() || "U";
    }
  }

function init() {
  const header = createUserHeader();

  updateIdentity();

  if (window.BYRHUD?.sync) {
    BYRHUD.sync();
  }

  const userHeader =
    header || document.getElementById(HEADER_ID);

  if (!userHeader) {
    return;
  }

  const updateCompactState = () => {
    userHeader.classList.toggle(
      "is-compact",
      window.scrollY > 120
    );
  };

  updateCompactState();

  window.addEventListener(
    "scroll",
    updateCompactState,
    { passive: true }
  );
}
})();