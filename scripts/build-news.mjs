import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const root = process.cwd();

const sourceDir = path.join(root, "content", "news");
const outputDir = path.join(root, "news");
const dataDir = path.join(root, "assets", "data");

await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });

const files = (await fs.readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith(".md"));

const posts = [];

for (const filename of files) {
  const sourcePath = path.join(sourceDir, filename);
  const raw = await fs.readFile(sourcePath, "utf8");

  const { data, content } = matter(raw);

  if (data.published === false) {
    continue;
  }

  const slug = filename.replace(/\.md$/i, "");

  const html = sanitizeHtml(marked.parse(content), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "figure",
      "figcaption",
    ]),
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "loading"],
    },
  });

  const post = {
    slug,
    title: String(data.title || slug),
    date: new Date(data.date || Date.now()).toISOString(),
    description: String(data.description || ""),
    image: String(data.image || ""),
    html,
  };

  posts.push(post);

  const postDir = path.join(outputDir, slug);

  await fs.mkdir(postDir, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(postDir, "index.html"),
    renderPost(post),
    "utf8"
  );
}

posts.sort((a, b) => {
  return new Date(b.date) - new Date(a.date);
});

await fs.writeFile(
  path.join(dataDir, "news.json"),
  JSON.stringify(posts, null, 2),
  "utf8"
);

/*
 * WICHTIG:
 *
 * news/index.html wird absichtlich NICHT erzeugt.
 *
 * Die Datei news/index.html ist jetzt deine feste,
 * schön gestaltete News-Übersichtsseite.
 *
 * Diese Seite lädt die Beiträge aus:
 *
 * /assets/data/news.json
 *
 * Dadurch wird dein Design beim nächsten Netlify-Build
 * nicht mehr überschrieben.
 */

function renderPost(post) {
  const image = post.image
    ? `
      <img
        class="article-hero"
        src="${escapeHtml(post.image)}"
        alt="${escapeHtml(post.title)}"
      >
    `
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escapeHtml(post.title)} | ThurSky</title>

  <meta
    name="description"
    content="${escapeHtml(post.description)}"
  >

  <meta name="robots" content="index,follow">

  <link
    rel="stylesheet"
    href="/assets/css/style.css"
  >

  <style>
    :root {
      --dark: #256c70;
      --dark-2: #1d5559;
      --accent: #f5a623;
      --bg: #f3f3f3;
      --card: #ffffff;
      --text: #222222;
      --muted: #5b6265;
      --border: rgba(37,108,112,.15);
      --shadow: 0 12px 28px rgba(0,0,0,.14);
      --shadow-strong: 0 18px 38px rgba(0,0,0,.22);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    body.menu-open {
      overflow: hidden;
    }

    a {
      color: inherit;
    }

    img {
      display: block;
      max-width: 100%;
    }

    .site-header {
      position: sticky;
      top: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 88px;
      padding: 12px 20px;
      background: var(--dark);
      box-shadow: 0 4px 14px rgba(0,0,0,.24);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
    }

    .brand img {
      width: auto;
      height: 62px;
      object-fit: contain;
    }

    .menu-toggle {
      width: 52px;
      height: 52px;
      padding: 0;
      border: 0;
      border-radius: 15px;
      background: rgba(255,255,255,.10);
      color: white;
      cursor: pointer;
      font-size: 32px;
      line-height: 1;
      transition:
        transform .25s ease,
        background .25s ease;
    }

    .menu-toggle:hover,
    .menu-toggle:focus-visible {
      transform: scale(1.05);
      background: rgba(255,255,255,.18);
      outline: none;
    }

    .main-nav {
      display: none;
      position: fixed;
      z-index: 2100;
      top: 100px;
      right: 20px;
      width: min(330px, calc(100vw - 40px));
      max-height: calc(100vh - 125px);
      overflow-y: auto;
      padding: 14px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 20px;
      background: var(--dark);
      box-shadow: 0 20px 50px rgba(0,0,0,.38);
      animation: menuIn .22s ease;
    }

    .main-nav.open {
      display: flex;
      flex-direction: column;
    }

    .main-nav a {
      display: block;
      padding: 14px 16px;
      border-radius: 12px;
      color: white;
      text-decoration: none;
      font-size: 17px;
      transition:
        background .2s ease,
        color .2s ease;
    }

    .main-nav a:hover,
    .main-nav a:focus-visible,
    .main-nav a[aria-current="page"] {
      background: rgba(255,255,255,.12);
      color: var(--accent);
      outline: none;
    }

    .main-nav .account-link {
      margin-top: 8px;
      background: var(--accent);
      color: #1f2728;
      font-weight: 700;
    }

    .menu-backdrop {
      display: none;
      position: fixed;
      z-index: 1900;
      inset: 0;
      background: rgba(0,0,0,.38);
      backdrop-filter: blur(2px);
    }

    .menu-backdrop.open {
      display: block;
    }

    .hero {
      min-height: 54vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 50px 20px;
      text-align: center;
      color: white;
      border-radius: 0 0 32px 32px;
      background:
        linear-gradient(
          rgba(0,0,0,.47),
          rgba(0,0,0,.58)
        ),
        url("/assets/images/hero.jpg")
        center / cover no-repeat;
      box-shadow: 0 12px 30px rgba(0,0,0,.18);
    }

    .hero-inner {
      width: min(850px, 100%);
      padding: 28px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 24px;
      background: rgba(0,0,0,.25);
      backdrop-filter: blur(3px);
    }

    .eyebrow {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: .85rem;
      font-weight: 800;
      letter-spacing: .13em;
      text-transform: uppercase;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2.1rem, 6vw, 4.2rem);
      line-height: 1.08;
      text-shadow: 0 3px 14px rgba(0,0,0,.35);
    }

    .hero p:last-child {
      max-width: 720px;
      margin: 18px auto 0;
      color: white;
      font-size: clamp(1rem, 2.4vw, 1.22rem);
      line-height: 1.65;
    }

    main {
      width: min(1000px, 100%);
      margin: 0 auto;
      padding: 48px 16px 75px;
    }

    .article {
      padding: clamp(24px, 5vw, 48px);
      border: 1px solid var(--border);
      border-radius: 22px;
      background: var(--card);
      box-shadow: var(--shadow);
    }

    .article-date {
      margin: 0 0 10px;
      color: var(--dark);
      font-size: .9rem;
      font-weight: 800;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    .article h1 {
      margin: 0 0 16px;
      color: var(--dark-2);
      font-size: clamp(2rem, 5vw, 3.3rem);
      line-height: 1.12;
    }

    .article-lead {
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 1.15rem;
      line-height: 1.75;
    }

    .article-hero {
      width: 100%;
      max-height: 560px;
      margin: 24px 0 32px;
      border-radius: 18px;
      object-fit: cover;
      box-shadow: 0 12px 28px rgba(0,0,0,.16);
    }

    .article-body {
      color: #34393b;
      font-size: 1.05rem;
      line-height: 1.82;
    }

    .article-body h2,
    .article-body h3 {
      margin-top: 1.8em;
      color: var(--dark-2);
      line-height: 1.25;
    }

    .article-body p {
      margin: 0 0 1.25em;
    }

    .article-body img {
      width: auto;
      height: auto;
      margin: 28px auto;
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    .article-body a {
      color: var(--dark);
      font-weight: 700;
    }

    .article-body blockquote {
      margin: 24px 0;
      padding: 17px 20px;
      border-left: 5px solid var(--accent);
      border-radius: 0 12px 12px 0;
      background: rgba(245,166,35,.09);
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 32px;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 12px 19px;
      border-radius: 13px;
      background:
        linear-gradient(
          135deg,
          var(--dark),
          var(--dark-2)
        );
      color: white;
      text-decoration: none;
      font-weight: 750;
      box-shadow:
        0 8px 18px rgba(37,108,112,.2);
      transition:
        transform .22s ease,
        box-shadow .22s ease;
    }

    .button:hover {
      transform: translateY(-2px);
      box-shadow:
        0 11px 24px rgba(37,108,112,.3);
    }

    .site-footer {
      padding: 27px 18px;
      border-radius: 30px 30px 0 0;
      background: var(--dark);
      color: white;
      text-align: center;
    }

    .site-footer p {
      margin: 0 0 9px;
      color: white;
    }

    .site-footer a {
      color: white;
    }

    @keyframes menuIn {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(.98);
      }

      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (min-width: 700px) {
      .brand img {
        height: 70px;
      }

      .main-nav {
        top: 104px;
      }

      main {
        padding:
          58px 24px 90px;
      }
    }

    @media (max-width: 600px) {
      .site-header {
        min-height: 80px;
        padding: 10px 14px;
      }

      .brand img {
        height: 56px;
      }

      .main-nav {
        top: 92px;
        right: 12px;
        width: calc(100vw - 24px);
      }

      .hero {
        min-height: 48vh;
        padding: 34px 14px;
      }

      .hero-inner {
        padding: 22px 16px;
      }
    }
  </style>
</head>

<body>
  <header class="site-header">
    <a
      class="brand"
      href="/"
      aria-label="ThurSky Startseite"
    >
      <img
        src="/assets/images/logo.png"
        onerror="this.onerror=null;this.src='/logo.png'"
        alt="ThurSky Logo"
      >
    </a>

    <button
      class="menu-toggle"
      id="menuToggle"
      type="button"
      aria-label="Menü öffnen"
      aria-controls="mainNav"
      aria-expanded="false"
    >
      ☰
    </button>

    <nav
      class="main-nav"
      id="mainNav"
      aria-label="Hauptnavigation"
    >
      <a href="/">Start</a>
      <a href="/ueber-mich/">
        Ich &amp; Equipment
      </a>
      <a href="/leistungen/">
        Leistungen
      </a>
      <a href="/galerie/">
        Galerie
      </a>
      <a href="/preise/">
        Preise
      </a>
      <a
        href="/news/"
        aria-current="page"
      >
        News
      </a>
      <a href="/bestellen/">
        Bestellen
      </a>
      <a href="/kontakt/">
        Kontakt
      </a>
      <a
        class="account-link"
        href="/konto/"
      >
        Kundenkonto
      </a>
    </nav>
  </header>

  <div
    class="menu-backdrop"
    id="menuBackdrop"
  ></div>

  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">
        News von ThurSky
      </p>

      <h1>
        ${escapeHtml(post.title)}
      </h1>

      <p>
        ${escapeHtml(
          post.description ||
          "Aktuelles und Einblicke von ThurSky."
        )}
      </p>
    </div>
  </section>

  <main>
    <article class="article">
      <p class="article-date">
        ${formatDate(post.date)}
      </p>

      <h1>
        ${escapeHtml(post.title)}
      </h1>

      ${
        post.description
          ? `
            <p class="article-lead">
              ${escapeHtml(post.description)}
            </p>
          `
          : ""
      }

      ${image}

      <div class="article-body">
        ${post.html}
      </div>

      <div class="button-row">
        <a
          class="button"
          href="/news/"
        >
          ← Zurück zu News
        </a>

        <a
          class="button"
          href="/"
        >
          Zur Startseite
        </a>
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <p>
      ThurSky © ${new Date().getFullYear()}
    </p>

    <a href="/impressum.html">
      Impressum
    </a>
  </footer>

  <script>
    (() => {
      const button =
        document.getElementById("menuToggle");

      const nav =
        document.getElementById("mainNav");

      const backdrop =
        document.getElementById("menuBackdrop");

      function setOpen(open) {
        nav.classList.toggle(
          "open",
          open
        );

        backdrop.classList.toggle(
          "open",
          open
        );

        document.body.classList.toggle(
          "menu-open",
          open
        );

        button.setAttribute(
          "aria-expanded",
          String(open)
        );

        button.setAttribute(
          "aria-label",
          open
            ? "Menü schliessen"
            : "Menü öffnen"
        );

        button.textContent =
          open ? "×" : "☰";
      }

      button.addEventListener(
        "click",
        () => {
          setOpen(
            !nav.classList.contains("open")
          );
        }
      );

      backdrop.addEventListener(
        "click",
        () => setOpen(false)
      );

      nav.querySelectorAll("a")
        .forEach((link) => {
          link.addEventListener(
            "click",
            () => setOpen(false)
          );
        });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }
      );
    })();
  </script>
</body>
</html>`;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "de-CH",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  ).format(date);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]
  );
}
