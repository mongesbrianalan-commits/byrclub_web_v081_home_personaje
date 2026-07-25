(() => {
  const LAYOUT_ID = "byr-app-header";

  function getRootPath() {
    const configuredRoot = document.body?.dataset?.root;

    if (configuredRoot) {
      return configuredRoot.endsWith("/")
        ? configuredRoot
        : `${configuredRoot}/`;
    }

    return "./";
  }

  function createNavigation(rootPath) {
    const header = document.createElement("header");

    header.className = "site-header";

    header.innerHTML = `
      <a class="brand" href="${rootPath}index.html">
        <img
          src="${rootPath}logo-byr.png"
          alt="BYR Club"
        />
      </a>

      <nav
        class="site-nav"
        aria-label="Navegación principal"
      >
        <a href="${rootPath}index.html">
          Inicio
        </a>

        <a href="${rootPath}beneficios.html">
          Beneficios
        </a>

        <a href="${rootPath}prodes.html">
          Prodes
        </a>

        <a href="${rootPath}juegos.html">
          Juegos
        </a>

        <a href="${rootPath}puntos.html">
          Puntos
        </a>

        <a href="${rootPath}perfil.html">
          Mi perfil
        </a>
      </nav>

      <a
        class="header-button"
        href="${rootPath}perfil.html"
      >
        Ver recompensas
      </a>
    `;

    return header;
  }

  function markActiveNavigation(layout) {
    const currentPath =
      window.location.pathname.toLowerCase();

    const links = layout.querySelectorAll(
      ".site-nav a"
    );

    links.forEach((link) => {
      const href = link
        .getAttribute("href")
        ?.toLowerCase();

      if (!href) {
        return;
      }

      const fileName = href.split("/").pop();

      if (
        fileName &&
        currentPath.endsWith(fileName)
      ) {
        link.classList.add("is-active");
      }

      /*
       * Todas las páginas internas de juegos
       * mantienen Juegos como sección activa.
       */
      if (
        currentPath.includes("/games/") &&
        fileName === "juegos.html"
      ) {
        link.classList.add("is-active");
      }
    });
  }

  function createLayout() {
    const existingLayout =
      document.getElementById(LAYOUT_ID);

    if (existingLayout) {
      return existingLayout;
    }

    const rootPath = getRootPath();

    const layout = document.createElement("div");

    layout.id = LAYOUT_ID;
    layout.className = "byr-app-header";

    const existingSiteHeader =
      document.querySelector(".site-header");

    if (existingSiteHeader) {
      existingSiteHeader.insertAdjacentElement(
        "beforebegin",
        layout
      );

      layout.appendChild(existingSiteHeader);
    } else {
      layout.appendChild(
        createNavigation(rootPath)
      );

      document.body.prepend(layout);
    }

    markActiveNavigation(layout);

    return layout;
  }

  function init() {
    createLayout();
  }

  window.BYRLayout = {
    init,
    createLayout
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();