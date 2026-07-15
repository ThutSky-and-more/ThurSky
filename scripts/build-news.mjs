import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const root = process.cwd();
const sourceDir = path.join(root, "content", "news");
const outputDir = path.join(root, "news");
const dataDir = path.join(root, "assets", "data");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });

const files = (await fs.readdir(sourceDir)).filter((name) => name.endsWith(".md"));
const posts = [];

for (const filename of files) {
  const raw = await fs.readFile(path.join(sourceDir, filename), "utf8");
  const { data, content } = matter(raw);
  if (data.published === false) continue;

  const slug = filename.replace(/\.md$/i, "");
  const html = sanitizeHtml(marked.parse(content), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] }
  });

  const post = {
    slug,
    title: String(data.title || slug),
    date: new Date(data.date || Date.now()).toISOString(),
    description: String(data.description || ""),
    image: String(data.image || ""),
    html
  };
  posts.push(post);
  await fs.mkdir(path.join(outputDir, slug), { recursive: true });
  await fs.writeFile(path.join(outputDir, slug, "index.html"), renderPost(post), "utf8");
}

posts.sort((a, b) => new Date(b.date) - new Date(a.date));
await fs.writeFile(path.join(dataDir, "news.json"), JSON.stringify(posts, null, 2), "utf8");
await fs.writeFile(path.join(outputDir, "index.html"), renderIndex(posts), "utf8");

function layout(title, description, body) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | ThurSky</title><meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="/assets/css/style.css"></head><body>
<header class="site-header"><a class="brand" href="/"><img src="/assets/images/logo.png" alt="ThurSky Logo"><span>ThurSky</span></a><nav class="desktop-nav"><a href="/">Start</a><a href="/news/">News</a><a href="/konto/">Kundenkonto</a></nav></header>
<main class="page-shell">${body}</main><footer class="site-footer">ThurSky © ${new Date().getFullYear()}</footer></body></html>`;
}

function renderIndex(posts) {
  const cards = posts.length
    ? posts.map((p) => `<article class="card news-card">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : ""}<div><p class="eyebrow">${formatDate(p.date)}</p><h2><a href="/news/${p.slug}/">${escapeHtml(p.title)}</a></h2><p>${escapeHtml(p.description)}</p><a class="text-link" href="/news/${p.slug}/">Weiterlesen</a></div></article>`).join("")
    : `<div class="card"><p>Noch keine News vorhanden.</p></div>`;
  return layout("News", "Aktuelle Neuigkeiten von ThurSky", `<section class="hero-small"><p class="eyebrow">Aktuelles</p><h1>News</h1><p>Projekte, Angebote und Einblicke von ThurSky.</p></section><section class="news-grid">${cards}</section>`);
}

function renderPost(post) {
  const image = post.image ? `<img class="article-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">` : "";
  return layout(post.title, post.description, `<article class="article card"><p class="eyebrow">${formatDate(post.date)}</p><h1>${escapeHtml(post.title)}</h1><p class="lead">${escapeHtml(post.description)}</p>${image}<div class="article-body">${post.html}</div><p><a class="text-link" href="/news/">Zurück zu News</a></p></article>`);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
