import fs from "node:fs/promises";
import path from "node:path";

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
  const { data, content } = parseFrontMatter(raw);
  if (data.published === false) continue;

  const slug = filename.replace(/\.md$/i, "");
  const html = renderMarkdown(content);

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

function parseFrontMatter(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { data: {}, content: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) data[key] = parseFrontMatterValue(value);
  }

  return { data, content: source.slice(match[0].length) };
}

function parseFrontMatterValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function renderMarkdown(source) {
  const blocks = source.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const heading = lines[0].match(/^(#{1,2})\s+(.+)$/);
    if (heading && lines.length === 1) {
      const level = heading[1].length;
      return `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`;
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`).join("");
      return `<ul>${items}</ul>`;
    }

    return `<p>${lines.map((line) => renderInlineMarkdown(line)).join("<br>")}</p>`;
  }).join("\n");
}

function renderInlineMarkdown(source) {
  let html = escapeHtml(source);
  html = html.replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}
