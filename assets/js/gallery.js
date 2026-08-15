(() => {
  "use strict";

  const galleryGrid =
    document.querySelector("[data-gallery-grid]");

  if (!galleryGrid) {
    console.error(
      "Galerie konnte nicht gestartet werden: " +
      "[data-gallery-grid] wurde nicht gefunden."
    );

    return;
  }

  let galleryItems = [];
  let currentIndex = -1;

  /* =========================================================
     START
  ========================================================= */

  loadGallery();

  /* =========================================================
     GALERIE LADEN
  ========================================================= */

  async function loadGallery() {
    showLoading();

    try {
      const response = await fetch(
        "/content/gallery.json",
        {
          cache: "no-store",
          headers: {
            accept: "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(
          `Galerie konnte nicht geladen werden. HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (
        !data ||
        !Array.isArray(data.items)
      ) {
        throw new Error(
          "content/gallery.json enthält keine gültige Galerie."
        );
      }

      galleryItems = data.items
        .filter((item) => {
          return (
            item &&
            item.published !== false
          );
        })
        .filter(isValidItem);

      renderGallery();
    } catch (error) {
      console.error(
        "Fehler beim Laden der Galerie:",
        error
      );

      showError(
        error?.message ||
        "Die Galerie konnte nicht geladen werden."
      );
    }
  }

  /* =========================================================
     EINTRÄGE PRÜFEN
  ========================================================= */

  function isValidItem(item) {
    const type =
      String(item.type || "image")
        .trim()
        .toLowerCase();

    if (type === "video") {
      return Boolean(
        String(item.video || "").trim()
      );
    }

    return Boolean(
      String(item.image || "").trim()
    );
  }

  /* =========================================================
     GALERIE DARSTELLEN
  ========================================================= */

  function renderGallery() {
    galleryGrid.innerHTML = "";

    if (galleryItems.length === 0) {
      galleryGrid.innerHTML = `
        <div class="gallery-empty">
          <h3>Noch keine Aufnahmen vorhanden</h3>

          <p>
            Sobald Bilder oder Videos über das CMS
            veröffentlicht wurden, erscheinen sie hier.
          </p>
        </div>
      `;

      return;
    }

    galleryItems.forEach(
      (item, index) => {
        const element =
          createGalleryItem(
            item,
            index
          );

        galleryGrid.appendChild(
          element
        );
      }
    );
  }

  /* =========================================================
     EINZELNEN EINTRAG ERSTELLEN
  ========================================================= */

  function createGalleryItem(
    item,
    index
  ) {
    const article =
      document.createElement("article");

    article.className =
      "gallery-item";

    const type =
      String(
        item.type || "image"
      )
        .trim()
        .toLowerCase();

    if (type === "video") {
      renderVideoItem(
        article,
        item,
        index
      );
    } else {
      renderImageItem(
        article,
        item,
        index
      );
    }

    return article;
  }

  /* =========================================================
     BILD
  ========================================================= */

  function renderImageItem(
    article,
    item,
    index
  ) {
    const title =
      String(
        item.title ||
        "Drohnenaufnahme"
      );

    const alt =
      String(
        item.alt ||
        item.title ||
        "Drohnenaufnahme von ThurSky"
      );

    const image =
      String(item.image || "");

    const description =
      String(
        item.description || ""
      );

    article.innerHTML = `
      <button
        class="gallery-media-button"
        type="button"
        aria-label="${escapeHtml(
          `Bild ${title} vergrössern`
        )}"
      >
        <img
          class="gallery-media gallery-image"
          src="${escapeHtml(image)}"
          alt="${escapeHtml(alt)}"
          loading="lazy"
          decoding="async"
        >

        <span
          class="gallery-zoom-icon"
          aria-hidden="true"
        >
          ⛶
        </span>
      </button>

      ${
        title || description
          ? `
            <div class="gallery-caption">

              ${
                title
                  ? `
                    <h3>
                      ${escapeHtml(title)}
                    </h3>
                  `
                  : ""
              }

              ${
                description
                  ? `
                    <p>
                      ${escapeHtml(description)}
                    </p>
                  `
                  : ""
              }

            </div>
          `
          : ""
      }
    `;

    article
      .querySelector(
        ".gallery-media-button"
      )
      ?.addEventListener(
        "click",
        () => {
          openViewer(index);
        }
      );
  }

  /* =========================================================
     VIDEO
  ========================================================= */

  function renderVideoItem(
    article,
    item,
    index
  ) {
    const title =
      String(
        item.title ||
        "Drohnenvideo"
      );

    const description =
      String(
        item.description || ""
      );

    const video =
      String(item.video || "");

    const poster =
      String(item.poster || "");

    article.innerHTML = `
      <div class="gallery-video-wrapper">

        <video
          class="gallery-media gallery-video"
          controls
          playsinline
          preload="metadata"
          ${
            poster
              ? `poster="${escapeHtml(poster)}"`
              : ""
          }
        >
          <source
            src="${escapeHtml(video)}"
            type="${escapeHtml(
              getVideoMimeType(video)
            )}"
          >

          Dein Browser unterstützt
          dieses Video nicht.
        </video>

        <button
          class="gallery-fullscreen-button"
          type="button"
          aria-label="Video gross öffnen"
        >
          ⛶
        </button>

      </div>

      ${
        title || description
          ? `
            <div class="gallery-caption">

              ${
                title
                  ? `
                    <h3>
                      ${escapeHtml(title)}
                    </h3>
                  `
                  : ""
              }

              ${
                description
                  ? `
                    <p>
                      ${escapeHtml(description)}
                    </p>
                  `
                  : ""
              }

            </div>
          `
          : ""
      }
    `;

    article
      .querySelector(
        ".gallery-fullscreen-button"
      )
      ?.addEventListener(
        "click",
        () => {
          openViewer(index);
        }
      );
  }

  /* =========================================================
     VIEWER / LIGHTBOX
  ========================================================= */

  function ensureViewer() {
    let viewer =
      document.querySelector(
        "#thurskyGalleryViewer"
      );

    if (viewer) {
      return viewer;
    }

    viewer =
      document.createElement("div");

    viewer.id =
      "thurskyGalleryViewer";

    viewer.className =
      "gallery-viewer";

    viewer.setAttribute(
      "aria-hidden",
      "true"
    );

    viewer.innerHTML = `
      <div
        class="gallery-viewer-backdrop"
        data-viewer-close
      ></div>

      <div
        class="gallery-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Galerie"
      >

        <button
          class="gallery-viewer-close"
          type="button"
          data-viewer-close
          aria-label="Schliessen"
        >
          ×
        </button>

        <button
          class="gallery-viewer-nav gallery-viewer-prev"
          type="button"
          data-viewer-prev
          aria-label="Vorherige Aufnahme"
        >
          ‹
        </button>

        <div
          class="gallery-viewer-content"
          data-viewer-content
        ></div>

        <button
          class="gallery-viewer-nav gallery-viewer-next"
          type="button"
          data-viewer-next
          aria-label="Nächste Aufnahme"
        >
          ›
        </button>

      </div>
    `;

    document.body.appendChild(
      viewer
    );

    viewer
      .querySelectorAll(
        "[data-viewer-close]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          closeViewer
        );
      });

    viewer
      .querySelector(
        "[data-viewer-prev]"
      )
      ?.addEventListener(
        "click",
        showPrevious
      );

    viewer
      .querySelector(
        "[data-viewer-next]"
      )
      ?.addEventListener(
        "click",
        showNext
      );

    return viewer;
  }

  /* =========================================================
     VIEWER ÖFFNEN
  ========================================================= */

  function openViewer(index) {
    if (
      index < 0 ||
      index >= galleryItems.length
    ) {
      return;
    }

    currentIndex = index;

    const viewer =
      ensureViewer();

    viewer.classList.add(
      "is-open"
    );

    viewer.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.classList.add(
      "gallery-viewer-open"
    );

    renderViewerItem();
  }

  /* =========================================================
     VIEWER SCHLIESSEN
  ========================================================= */

  function closeViewer() {
    const viewer =
      document.querySelector(
        "#thurskyGalleryViewer"
      );

    if (!viewer) {
      return;
    }

    const video =
      viewer.querySelector("video");

    if (video) {
      video.pause();
    }

    viewer.classList.remove(
      "is-open"
    );

    viewer.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.classList.remove(
      "gallery-viewer-open"
    );
  }

  /* =========================================================
     VIEWER-INHALT
  ========================================================= */

  function renderViewerItem() {
    const viewer =
      ensureViewer();

    const content =
      viewer.querySelector(
        "[data-viewer-content]"
      );

    const item =
      galleryItems[currentIndex];

    if (!content || !item) {
      return;
    }

    /*
     * Laufendes Video des vorherigen
     * Eintrags stoppen.
     */
    const previousVideo =
      content.querySelector("video");

    if (previousVideo) {
      previousVideo.pause();
    }

    const type =
      String(
        item.type || "image"
      )
        .trim()
        .toLowerCase();

    const title =
      String(item.title || "");

    const description =
      String(
        item.description || ""
      );

    if (type === "video") {
      const video =
        String(item.video || "");

      const poster =
        String(item.poster || "");

      content.innerHTML = `
        <div class="gallery-viewer-media-wrap">

          <video
            class="gallery-viewer-video"
            controls
            autoplay
            playsinline
            preload="metadata"
            ${
              poster
                ? `poster="${escapeHtml(poster)}"`
                : ""
            }
          >
            <source
              src="${escapeHtml(video)}"
              type="${escapeHtml(
                getVideoMimeType(video)
              )}"
            >

            Dein Browser unterstützt
            dieses Video nicht.
          </video>

        </div>

        ${viewerCaption(
          title,
          description
        )}
      `;
    } else {
      const image =
        String(item.image || "");

      const alt =
        String(
          item.alt ||
          item.title ||
          "Drohnenaufnahme von ThurSky"
        );

      content.innerHTML = `
        <div class="gallery-viewer-media-wrap">

          <img
            class="gallery-viewer-image"
            src="${escapeHtml(image)}"
            alt="${escapeHtml(alt)}"
          >

        </div>

        ${viewerCaption(
          title,
          description
        )}
      `;
    }

    updateViewerButtons();
  }

  function viewerCaption(
    title,
    description
  ) {
    if (
      !title &&
      !description
    ) {
      return "";
    }

    return `
      <div class="gallery-viewer-caption">

        ${
          title
            ? `
              <h3>
                ${escapeHtml(title)}
              </h3>
            `
            : ""
        }

        ${
          description
            ? `
              <p>
                ${escapeHtml(description)}
              </p>
            `
            : ""
        }

      </div>
    `;
  }

  /* =========================================================
     WEITER / ZURÜCK
  ========================================================= */

  function showNext(event) {
    event?.stopPropagation();

    if (
      galleryItems.length < 2
    ) {
      return;
    }

    currentIndex =
      (
        currentIndex + 1
      ) % galleryItems.length;

    renderViewerItem();
  }

  function showPrevious(event) {
    event?.stopPropagation();

    if (
      galleryItems.length < 2
    ) {
      return;
    }

    currentIndex =
      (
        currentIndex -
        1 +
        galleryItems.length
      ) % galleryItems.length;

    renderViewerItem();
  }

  function updateViewerButtons() {
    const viewer =
      ensureViewer();

    const previous =
      viewer.querySelector(
        "[data-viewer-prev]"
      );

    const next =
      viewer.querySelector(
        "[data-viewer-next]"
      );

    const showNavigation =
      galleryItems.length > 1;

    if (previous) {
      previous.hidden =
        !showNavigation;
    }

    if (next) {
      next.hidden =
        !showNavigation;
    }
  }

  /* =========================================================
     TASTATUR
  ========================================================= */

  document.addEventListener(
    "keydown",
    (event) => {
      const viewer =
        document.querySelector(
          "#thurskyGalleryViewer.is-open"
        );

      if (!viewer) {
        return;
      }

      if (event.key === "Escape") {
        closeViewer();
      }

      if (
        event.key ===
        "ArrowRight"
      ) {
        showNext();
      }

      if (
        event.key ===
        "ArrowLeft"
      ) {
        showPrevious();
      }
    }
  );

  /* =========================================================
     SWIPE AUF HANDYS
  ========================================================= */

  let touchStartX = null;

  document.addEventListener(
    "touchstart",
    (event) => {
      const viewer =
        document.querySelector(
          "#thurskyGalleryViewer.is-open"
        );

      if (!viewer) {
        return;
      }

      touchStartX =
        event
          .touches?.[0]
          ?.clientX ?? null;
    },
    {
      passive: true
    }
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const viewer =
        document.querySelector(
          "#thurskyGalleryViewer.is-open"
        );

      if (
        !viewer ||
        touchStartX === null
      ) {
        return;
      }

      const touchEndX =
        event
          .changedTouches?.[0]
          ?.clientX;

      if (
        typeof touchEndX !==
        "number"
      ) {
        touchStartX = null;
        return;
      }

      const difference =
        touchEndX -
        touchStartX;

      /*
       * Swipe nicht auslösen,
       * wenn nur leicht bewegt wurde.
       */
      if (
        Math.abs(difference) <
        60
      ) {
        touchStartX = null;
        return;
      }

      if (difference < 0) {
        showNext();
      } else {
        showPrevious();
      }

      touchStartX = null;
    },
    {
      passive: true
    }
  );

  /* =========================================================
     VIDEO MIME TYPE
  ========================================================= */

  function getVideoMimeType(path) {
    const cleanPath =
      String(path || "")
        .split("?")[0]
        .toLowerCase();

    if (
      cleanPath.endsWith(".webm")
    ) {
      return "video/webm";
    }

    if (
      cleanPath.endsWith(".mov")
    ) {
      return "video/quicktime";
    }

    return "video/mp4";
  }

  /* =========================================================
     LADE-/FEHLERMELDUNG
  ========================================================= */

  function showLoading() {
    galleryGrid.innerHTML = `
      <div class="gallery-status">
        Galerie wird geladen …
      </div>
    `;
  }

  function showError(message) {
    galleryGrid.innerHTML = `
      <div class="gallery-status gallery-status-error">

        <h3>
          Galerie konnte nicht geladen werden
        </h3>

        <p>
          ${escapeHtml(message)}
        </p>

      </div>
    `;
  }

  /* =========================================================
     HTML SICHER AUSGEBEN
  ========================================================= */

  function escapeHtml(value) {
    return String(
      value ?? ""
    ).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]
    );
  }
})();
