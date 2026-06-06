import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "content", "posts");
const projectsFile = path.join(root, "content", "projects.json");
const friendsFile = path.join(root, "content", "friends.json");
const tagsFile = path.join(root, "content", "tags.json");
const outputDir = path.join(root, "posts");
const assetVersion = "6.0-content-system";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontMatter(source, fileName) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`${fileName} is missing front matter`);
  }

  const data = {};
  match[1].split("\n").forEach((line) => {
    const index = line.indexOf(":");
    if (index === -1) {
      return;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    data[key] = value;
  });

  return { data, body: match[2].trim() };
}

function markdownToHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/);
  const html = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  blocks.forEach((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^-\s+/.test(line))) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      lines.forEach((line) => {
        html.push(`<li>${formatInline(line.replace(/^-\s+/, ""))}</li>`);
      });
      return;
    }

    closeList();
    const text = block.trim();
    if (!text) {
      return;
    }
    if (text.startsWith("### ")) {
      html.push(`<h3>${formatInline(text.slice(4))}</h3>`);
    } else if (text.startsWith("## ")) {
      html.push(`<h2>${formatInline(text.slice(3))}</h2>`);
    } else if (text.startsWith("# ")) {
      html.push(`<h2>${formatInline(text.slice(2))}</h2>`);
    } else {
      html.push(`<p>${formatInline(text.replace(/\n/g, "<br />"))}</p>`);
    }
  });

  closeList();
  return html.join("\n");
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function formatDate(date) {
  return date.replaceAll("-", ".");
}

function tagSlug(tag) {
  return slugify(tag);
}

function replaceBetween(source, name, replacement) {
  const pattern = new RegExp(`(\\s*<!-- POSTS:${name}:START -->)[\\s\\S]*?(\\s*<!-- POSTS:${name}:END -->)`);
  if (!pattern.test(source)) {
    throw new Error(`Missing POSTS:${name} markers`);
  }
  return source.replace(pattern, `$1\n${replacement}\n$2`);
}

function replaceContentBetween(source, name, replacement) {
  const pattern = new RegExp(`(\\s*<!-- CONTENT:${name}:START -->)[\\s\\S]*?(\\s*<!-- CONTENT:${name}:END -->)`);
  if (!pattern.test(source)) {
    throw new Error(`Missing CONTENT:${name} markers`);
  }
  return source.replace(pattern, `$1\n${replacement}\n$2`);
}

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function normalizeList(value, key) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && Array.isArray(value[key])) {
    return value[key];
  }
  return [];
}

async function loadPosts() {
  const files = (await readdir(postsDir)).filter((file) => file.endsWith(".md") && file !== "README.md");
  const posts = [];

  for (const file of files) {
    const source = await readFile(path.join(postsDir, file), "utf8");
    const { data, body } = parseFrontMatter(source, file);
    if (data.draft === "true") {
      continue;
    }

    const slug = data.slug ? slugify(data.slug) : slugify(file);
    const tags = (data.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    posts.push({
      title: data.title || slug,
      date: data.date || "1970-01-01",
      tags,
      summary: data.summary || "",
      readTime: data.readTime || "3 min read",
      slug,
      url: `posts/${slug}.html`,
      bodyHtml: markdownToHtml(body),
      search: [data.title, data.summary, tags.join(" "), body].join(" ").replace(/\s+/g, " ").trim().toLowerCase(),
    });
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

function renderHomeCards(posts) {
  return posts.slice(0, 3).map((post) => `              <a class="writing-card" href="${post.url}">
                <span class="writing-card__date">${formatDate(post.date)}</span>
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.summary)}</p>
                <span class="writing-card__tags">${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span>
              </a>`).join("\n");
}

function renderTagButtons(posts) {
  const configuredTags = globalThis.configuredTags || [];
  const allTags = [...configuredTags, ...posts.flatMap((post) => post.tags)];
  const tags = [...new Map(allTags.map((tag) => [tagSlug(tag), tag])).values()];
  return [
    '          <button class="tag-pill is-active" type="button" data-filter-tag="all" data-i18n="blog.tag.all">全部</button>',
    ...tags.map((tag) => `          <button class="tag-pill" type="button" data-filter-tag="${tagSlug(tag)}">${escapeHtml(tag)}</button>`),
  ].join("\n");
}

function renderArchiveItems(posts) {
  return posts.map((post, index) => {
    const number = String(index + 1).padStart(3, "0");
    const tagSlugs = post.tags.map(tagSlug).join(" ");
    return `          <a
            class="article-item"
            href="${post.url}"
            id="article-${number}"
            data-article
            data-tags="${escapeHtml(tagSlugs)}"
            data-search="${escapeHtml(post.search)}"
          >
            <span class="article-item__number">${number}</span>
            <span class="article-item__content">
              <span class="article-item__title">${escapeHtml(post.title)}</span>
              <span class="article-item__meta">${escapeHtml(post.tags.join(" · "))} · ${escapeHtml(post.readTime)}</span>
              <span class="article-item__summary">${escapeHtml(post.summary)}</span>
              <span class="article-item__tags">
${post.tags.map((tag) => `                <span>${escapeHtml(tag)}</span>`).join("\n")}
              </span>
            </span>
            <span class="article-item__arrow">↗</span>
          </a>`;
  }).join("\n");
}

function renderPostPage(post) {
  const tags = post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(post.title)} - maki's blog</title>
    <meta name="description" content="${escapeHtml(post.summary)}" />
    <link rel="stylesheet" href="../styles.css?v=${assetVersion}" />
  </head>
  <body>
    <div class="site-line" aria-hidden="true"></div>
    <header class="site-header">
      <div class="header-actions" aria-label="站点设置">
        <button class="rotary-knob" type="button" aria-label="Scroll control" data-rotary-knob>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle class="rotary-knob__outer" cx="32" cy="32" r="27" />
            <circle class="rotary-knob__inner" cx="32" cy="32" r="18" />
            <path class="rotary-knob__grip" d="M32 9v10M32 45v10M9 32h10M45 32h10M15.7 15.7l7 7M41.3 41.3l7 7M48.3 15.7l-7 7M22.7 41.3l-7 7" />
            <path class="rotary-knob__indicator" d="M32 32V17" />
          </svg>
        </button>
        <button class="utility-button" type="button" data-lang-toggle aria-label="Switch language">EN</button>
        <button class="utility-button" type="button" data-theme-toggle aria-label="Toggle dark mode">Dark</button>
      </div>
      <a class="brand" href="../index.html" aria-label="maki blog home">maki</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="主导航">
        <a class="nav-link" href="../index.html"><span data-i18n="nav.home">首页</span></a>
        <a class="nav-link" href="../articles.html"><span data-i18n="nav.articles">文章</span></a>
        <a class="nav-link" href="../projects.html"><span data-i18n="nav.projects">项目</span></a>
        <a class="nav-link" href="../friends.html"><span data-i18n="nav.friends">友链</span></a>
        <a class="nav-link" href="../guestbook.html"><span data-i18n="nav.guestbook">留言板</span></a>
        <a class="nav-link" href="../about.html"><span data-i18n="nav.about">关于</span></a>
      </nav>
    </header>

    <main class="page post-page inner-page">
      <article class="post-shell">
        <a class="post-back" href="../articles.html">← 返回文章列表</a>
        <header class="post-header">
          <span class="page-heading__index">${formatDate(post.date)} // ${escapeHtml(post.readTime)}</span>
          <h1>${escapeHtml(post.title)}</h1>
          <p>${escapeHtml(post.summary)}</p>
          <div class="article-item__tags">${tags}</div>
        </header>
        <div class="post-content">
${post.bodyHtml}
        </div>
      </article>
    </main>

    <footer class="site-footer">
      <div class="footer-bottom">
        <p data-i18n="footer.copy">© 2026 maki. Built for notes, ideas, and experiments.</p>
        <a href="../index.html" data-i18n="footer.back">回到首页</a>
      </div>
    </footer>

    <script src="../script.js?v=${assetVersion}"></script>
  </body>
</html>
`;
}

function renderProjects(projects) {
  return projects.map((project) => `          <a class="project-card" href="${escapeHtml(project.url || `projects.html#${project.id}`)}" id="${escapeHtml(project.id)}">
            <span class="project-card__tag">${escapeHtml(project.tag || "project")}</span>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.summary)}</p>
            <span class="project-card__meta">${escapeHtml(project.meta || "")}</span>
          </a>`).join("\n");
}

function renderFriends(friends) {
  return friends.map((friend) => `          <a class="friend-card" href="${escapeHtml(friend.url || `friends.html#${friend.id}`)}" id="${escapeHtml(friend.id)}"${friend.url && !friend.url.startsWith("friends.html#") ? ' target="_blank" rel="noopener noreferrer"' : ""}>
            <span class="friend-card__avatar">${escapeHtml(friend.avatar || friend.name?.[0] || "?")}</span>
            <span>
              <strong>${escapeHtml(friend.name)}</strong>
              <small>${escapeHtml(friend.description)}</small>
              <em>${escapeHtml(friend.meta || "")}</em>
            </span>
          </a>`).join("\n");
}

async function main() {
  const posts = await loadPosts();
  const projects = normalizeList(await readJson(projectsFile), "projects");
  const friends = normalizeList(await readJson(friendsFile), "friends");
  globalThis.configuredTags = normalizeList(await readJson(tagsFile), "tags");
  await mkdir(outputDir, { recursive: true });

  let indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  indexHtml = replaceBetween(indexHtml, "HOME", renderHomeCards(posts));
  indexHtml = indexHtml.replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`);
  indexHtml = indexHtml.replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`);
  indexHtml = indexHtml.replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`);
  indexHtml = indexHtml.replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "index.html"), indexHtml);

  let articlesHtml = await readFile(path.join(root, "articles.html"), "utf8");
  articlesHtml = replaceBetween(articlesHtml, "TAGS", renderTagButtons(posts));
  articlesHtml = replaceBetween(articlesHtml, "ARCHIVE", renderArchiveItems(posts));
  articlesHtml = articlesHtml.replace(/archive \/\/ \d+ entries/g, `archive // ${String(posts.length).padStart(3, "0")} entries`);
  articlesHtml = articlesHtml.replace(/<span data-article-count>.*?<\/span>/, `<span data-article-count>${posts.length} articles</span>`);
  articlesHtml = articlesHtml.replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "articles.html"), articlesHtml);

  let projectsHtml = await readFile(path.join(root, "projects.html"), "utf8");
  projectsHtml = replaceContentBetween(projectsHtml, "PROJECTS", renderProjects(projects));
  projectsHtml = projectsHtml
    .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
    .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "projects.html"), projectsHtml);

  let friendsHtml = await readFile(path.join(root, "friends.html"), "utf8");
  friendsHtml = replaceContentBetween(friendsHtml, "FRIENDS", renderFriends(friends));
  friendsHtml = friendsHtml
    .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
    .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "friends.html"), friendsHtml);

  for (const file of ["about.html", "guestbook.html"]) {
    const filePath = path.join(root, file);
    const html = (await readFile(filePath, "utf8"))
      .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
      .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
      .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
      .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
    await writeFile(filePath, html);
  }

  for (const post of posts) {
    await writeFile(path.join(outputDir, `${post.slug}.html`), renderPostPage(post));
  }

  console.log(`Generated ${posts.length} posts, ${projects.length} projects, and ${friends.length} friends.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
