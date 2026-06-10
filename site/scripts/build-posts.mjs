import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "content", "posts");
const projectsFile = path.join(root, "content", "projects.json");
const friendsFile = path.join(root, "content", "friends.json");
const tagsFile = path.join(root, "content", "tags.json");
const socialsFile = path.join(root, "content", "socials.json");
const outputDir = path.join(root, "posts");
const assetVersion = "8.2-compact-headings";
const siteUrl = "https://maki-s-blog.vercel.app";
const siteTitle = "maki's blog";
const siteDescription = "maki 的个人博客，用来记录技术、想法、作品和生活。";

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
  let currentListKey = "";
  match[1].split("\n").forEach((line) => {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      data[currentListKey] = [...(Array.isArray(data[currentListKey]) ? data[currentListKey] : []), listMatch[1].trim()];
      return;
    }

    const index = line.indexOf(":");
    if (index === -1) {
      return;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    currentListKey = value ? "" : key;
    data[key] = value || [];
  });

  return { data, body: match[2].trim() };
}

function markdownToHtml(markdown) {
  const normalizedMarkdown = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n(?=#{1,6}\s+)/g, "\n\n")
    .replace(/\n(?=!\[[^\]]*\]\([^)]+\))/g, "\n\n")
    .replace(/\n(?=---+\s*$)/gm, "\n\n");
  const blocks = normalizedMarkdown.split(/\n{2,}/);
  const html = [];
  let inList = false;
  const headingIds = new Map();

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function uniqueHeadingId(value) {
    const base = slugify(value.replace(/[`*_#[\]()]/g, "")) || "section";
    const count = headingIds.get(base) || 0;
    headingIds.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  }

  function renderCodeBlock(block) {
    const match = block.match(/^```(\S+)?\n([\s\S]*?)\n?```$/);
    if (!match) {
      return null;
    }

    const language = match[1] || "text";
    return `<pre data-code-block data-language="${escapeHtml(language)}"><code>${escapeHtml(match[2])}</code></pre>`;
  }

  function renderImageBlock(block) {
    const match = block.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);
    if (!match) {
      return null;
    }

    const alt = escapeHtml(match[1] || "");
    const src = escapeHtml(match[2] || "");
    const caption = escapeHtml(match[3] || match[1] || "");
    return `<figure class="post-image"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" />${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
  }

  blocks.forEach((block) => {
    const trimmedBlock = block.trim();
    const codeBlock = renderCodeBlock(trimmedBlock);
    if (codeBlock) {
      closeList();
      html.push(codeBlock);
      return;
    }

    const imageBlock = renderImageBlock(trimmedBlock);
    if (imageBlock) {
      closeList();
      html.push(imageBlock);
      return;
    }

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

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      closeList();
      html.push("<ol>");
      lines.forEach((line) => {
        html.push(`<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      });
      html.push("</ol>");
      return;
    }

    if (lines.every((line) => /^>\s?/.test(line))) {
      closeList();
      html.push(`<blockquote>${lines.map((line) => `<p>${formatInline(line.replace(/^>\s?/, ""))}</p>`).join("")}</blockquote>`);
      return;
    }

    closeList();
    const text = block.trim();
    if (!text) {
      return;
    }
    if (/^---+$/.test(text)) {
      html.push("<hr />");
    } else if (text.startsWith("#### ")) {
      const heading = text.slice(5);
      html.push(`<h4 id="${uniqueHeadingId(heading)}">${formatInline(heading)}</h4>`);
    } else if (text.startsWith("### ")) {
      const heading = text.slice(4);
      html.push(`<h3 id="${uniqueHeadingId(heading)}">${formatInline(heading)}</h3>`);
    } else if (text.startsWith("## ")) {
      const heading = text.slice(3);
      html.push(`<h2 id="${uniqueHeadingId(heading)}">${formatInline(heading)}</h2>`);
    } else if (text.startsWith("# ")) {
      const heading = text.slice(2);
      html.push(`<h2 id="${uniqueHeadingId(heading)}">${formatInline(heading)}</h2>`);
    } else {
      html.push(`<p>${formatInline(text.replace(/\n/g, "<br />"))}</p>`);
    }
  });

  closeList();
  return html.join("\n");
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, '<img class="post-inline-image" src="$2" alt="$1" loading="lazy" decoding="async" />')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function formatDate(date) {
  return String(date).slice(0, 10).replaceAll("-", ".");
}

function formatDateTime(date) {
  const value = String(date || "");
  const [datePart, timePart = "00:00"] = value.replace("T", " ").split(/\s+/);
  return `${formatDate(datePart)} ${timePart.slice(0, 5)}`;
}

function countPostWords(text = "") {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const westernWords = text
    .replace(/[\u4e00-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  return chineseChars + westernWords;
}

function computedReadTime(markdown = "") {
  const withoutCode = String(markdown || "").replace(/```[\s\S]*?```/g, " ");
  const plainText = withoutCode
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~\-\d.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const minutes = Math.max(1, Math.ceil(countPostWords(plainText) / 420));
  return `${minutes} MIN READ`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagSlug(tag) {
  return slugify(tag);
}

function replaceBetween(source, name, replacement) {
  const pattern = new RegExp(`(\\s*<!-- POSTS:${name}:START -->)\\s*[\\s\\S]*?\\s*(<!-- POSTS:${name}:END -->)`);
  if (!pattern.test(source)) {
    throw new Error(`Missing POSTS:${name} markers`);
  }
  return source.replace(pattern, `$1\n${replacement}\n          $2`);
}

function replaceContentBetween(source, name, replacement) {
  const pattern = new RegExp(`(\\s*<!-- CONTENT:${name}:START -->)\\s*[\\s\\S]*?\\s*(<!-- CONTENT:${name}:END -->)`);
  if (!pattern.test(source)) {
    throw new Error(`Missing CONTENT:${name} markers`);
  }
  return source.replace(pattern, `$1\n${replacement}\n          $2`);
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

function normalizeUrl(url = "") {
  if (!url) {
    return "#";
  }
  return url;
}

function isExternalUrl(url = "") {
  return /^https?:\/\//.test(url);
}

function absoluteUrl(urlPath = "") {
  if (isExternalUrl(urlPath)) {
    return urlPath;
  }
  return `${siteUrl}/${urlPath.replace(/^\/+/, "")}`;
}

function renderSocialIcon(social) {
  const key = `${social.label || ""} ${social.url || ""}`;
  if (/github/i.test(key)) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.2c-5.5 0-9.9 4.5-9.9 10 0 4.4 2.9 8.1 6.8 9.4.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.8.8.1-.6.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5a10 10 0 0 0 6.8-9.4c.1-5.5-4.4-10-9.9-10Z" />
        </svg>`;
  }
  if (/telegram|t\.me/i.test(key)) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M21.7 4.3c.3-1-.6-1.8-1.6-1.4L2.8 9.6c-1.2.5-1.2 2.2.1 2.6l4.4 1.4 1.7 5.4c.4 1.1 1.8 1.4 2.6.5l2.5-2.8 4.7 3.4c.9.7 2.2.2 2.4-1l2.5-14.8Zm-4.2 3.2-8.3 7.4-.3 3.1-1.1-3.7 9.7-6.8Z" />
        </svg>`;
  }
  if (/bilibili|哔哩/i.test(key)) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8.4 3.5 10.7 6h2.6l2.3-2.5 1.3 1.2L15.7 6h2.1a3.2 3.2 0 0 1 3.2 3.2v8.1a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 17.3V9.2A3.2 3.2 0 0 1 6.2 6h2.1L7.1 4.7l1.3-1.2Zm-2.2 8.1v5.7c0 .5.4.9.9.9h10.7c.5 0 .9-.4.9-.9V9.2c0-.5-.4-.9-.9-.9H6.2c-.5 0-.9.4-.9.9v2.4h.9Zm2.3 1.1c.6 0 1 .4 1 1v1.2c0 .6-.4 1-1 1s-1-.4-1-1v-1.2c0-.6.4-1 1-1Zm7 0c.6 0 1 .4 1 1v1.2c0 .6-.4 1-1 1s-1-.4-1-1v-1.2c0-.6.4-1 1-1Z" />
        </svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.5 21.5 8v8L12 21.5 2.5 16V8L12 2.5Zm0 2.8L5 9.3v5.4l7 4 7-4V9.3l-7-4Z" />
        </svg>`;
}

function renderFooterSocial(socials) {
  if (!socials.length) {
    return "";
  }

  return `      <div class="footer-social">
${socials.map((social) => {
  const url = normalizeUrl(social.url);
  const externalAttrs = isExternalUrl(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
  const label = escapeHtml(social.label);
  return `        <a href="${escapeHtml(url)}"${externalAttrs} class="social-link" aria-label="${label}" title="${label}"><span class="social-icon" aria-hidden="true">${renderSocialIcon(social)}</span><span class="social-label">${label}</span></a>`;
}).join("\n")}
      </div>`;
}

function replaceFooterSocial(html, socials) {
  const footer = renderFooterSocial(socials);
  return html.replace(/\n\s*<div class="footer-social">[\s\S]*?<\/div>\s*(?=\n\s*<div class="footer-bottom">)/, `\n${footer}`);
}

function ensureHeadMeta(html, { urlPath, title, description }) {
  const canonical = absoluteUrl(urlPath);
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);

  let next = html
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapedDescription}" />`)
    .replace(/\n\s*<link rel="canonical" href="[^"]*" \/>/g, "")
    .replace(/\n\s*<meta property="og:[^"]+" content="[^"]*" \/>/g, "")
    .replace(/\n\s*<meta name="twitter:[^"]+" content="[^"]*" \/>/g, "")
    .replace(/\n\s*<link rel="icon" href="[^"]*" \/>/g, "");

  const seo = `    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="/favicon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(siteTitle)}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />`;

  next = next.replace(/(\s*<link rel="stylesheet")/, `\n${seo}$1`);
  return next;
}

function renderGuestbookPage(html) {
  return html
    .replace('<a href="#guestbook-archive" data-rail-link>02 / archive</a>', "")
    .replace("guestbook // local notes", "guestbook // public notes")
    .replace(
    /<section class="page-panel" id="guestbook-panel"[\s\S]*?<\/section>\s*<\/main>/,
    `<section class="page-panel" id="guestbook-panel" aria-label="留言板" data-page-section>
        <div class="guestbook-board">
          <section class="guestbook-brief" aria-labelledby="guestbook-compose-title">
            <span class="guestbook-kicker">public channel</span>
            <h2 id="guestbook-compose-title" data-i18n="guestbook.panel.title">留言板 / Guestbook</h2>
            <p>这里使用 GitHub Issues 保存留言。登录 GitHub 后即可留言，所有访客都能看到。可以写建议、问题、想法，或者只是打个招呼。</p>
          </section>
          <aside class="guestbook-protocol" aria-label="留言方式">
            <div>
              <span>01</span>
              <strong>GitHub sign-in</strong>
              <p>使用 GitHub 身份留言，不需要额外注册。</p>
            </div>
            <div>
              <span>02</span>
              <strong>Public thread</strong>
              <p>留言会公开显示在这个页面下方。</p>
            </div>
            <div>
              <span>03</span>
              <strong>Page archive</strong>
              <p>同一页面对应同一条 issue 讨论线。</p>
            </div>
          </aside>
          <div class="guestbook-divider" aria-hidden="true">
            <span>giscus</span>
            <span>github discussions</span>
          </div>
          <section class="guestbook-comments" aria-label="公开留言">
            <div
              class="giscus-slot"
              data-giscus-comments
              data-repo="maki-cloud7/maki-s-blog"
              data-repo-id="R_kgDOSyizVA"
              data-category="General"
              data-category-id="DIC_kwDOSyizVM4C-orT"
            ></div>
          </section>
        </div>
      </section>
    </main>`,
  );
}

function renderSitemap(posts) {
  const staticPages = ["", "index.html", "articles.html", "projects.html", "friends.html", "guestbook.html", "about.html"];
  const urls = [
    ...staticPages.map((page) => ({ loc: absoluteUrl(page), priority: page === "" ? "1.0" : "0.8" })),
    ...posts.map((post) => ({ loc: absoluteUrl(post.url), priority: "0.7" })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${item.loc}</loc>
    <priority>${item.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function renderFavicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#101010"/>
  <circle cx="50" cy="14" r="5" fill="#e11919"/>
  <text x="12" y="43" fill="#f7f7f4" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900">m</text>
</svg>
`;
}

function renderNotFoundPage(socials) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page not found - maki's blog</title>
    <meta name="description" content="这个页面不存在。" />
    <link rel="canonical" href="${siteUrl}/404.html" />
    <link rel="icon" href="/favicon.svg" />
    <link rel="stylesheet" href="styles.css?v=${assetVersion}" />
  </head>
  <body>
    <div class="site-line" aria-hidden="true"></div>
    <main class="page post-page inner-page">
      <article class="post-shell">
        <a class="post-back" href="index.html">← 回到首页</a>
        <header class="post-header">
          <span class="page-heading__index">404 // not found</span>
          <h1>页面不存在</h1>
          <p>这个地址没有对应的页面。可以回到首页，或者查看文章与项目。</p>
        </header>
        <div class="post-content">
          <p><a href="articles.html">查看文章</a> / <a href="projects.html">查看项目</a></p>
        </div>
      </article>
    </main>
    <footer class="site-footer">
${renderFooterSocial(socials)}
      <div class="footer-bottom">
        <p>© 2026 maki. Built for notes, ideas, and experiments.</p>
        <a href="index.html">回到首页</a>
      </div>
    </footer>
  </body>
</html>
`;
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
    const tags = normalizeTags(data.tags);

    posts.push({
      sourcePath: `site/content/posts/${file}`,
      title: data.title || slug,
      date: data.date || "1970-01-01",
      tags,
      summary: data.summary || "",
      readTime: computedReadTime(body),
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
  const postsByYear = new Map();
  posts.forEach((post, index) => {
    const year = String(post.date).slice(0, 4) || "Archive";
    if (!postsByYear.has(year)) {
      postsByYear.set(year, []);
    }
    postsByYear.get(year).push({ post, index });
  });

  return [...postsByYear.entries()].map(([year, entries], yearIndex) => `          <details class="archive-year" data-archive-year ${yearIndex === 0 ? "open" : ""}>
            <summary>
              <span>${escapeHtml(year)}</span>
              <small>${entries.length} ${entries.length === 1 ? "post" : "posts"}</small>
            </summary>
            <div class="archive-year__list">
${entries.map(({ post, index }) => {
    const number = String(index + 1).padStart(3, "0");
    const tagSlugs = post.tags.map(tagSlug).join(" ");
    return `              <a
            class="article-item"
            href="${post.url}"
            id="article-${number}"
            data-article
            data-article-year="${escapeHtml(year)}"
            data-tags="${escapeHtml(tagSlugs)}"
            data-search="${escapeHtml(post.search)}"
          >
            <span class="article-item__number">${number}</span>
            <span class="article-item__content">
              <span class="article-item__title">${escapeHtml(post.title)}</span>
              <span class="article-item__meta">
                <span>${escapeHtml(formatDateTime(post.date))}</span>
              </span>
              <span class="article-item__summary">${escapeHtml(post.summary)}</span>
              <span class="article-item__tags">
${post.tags.map((tag) => `                <span>${escapeHtml(tag)}</span>`).join("\n")}
              </span>
            </span>
            <span class="article-item__arrow">↗</span>
          </a>`;
  }).join("\n")}
            </div>
          </details>`).join("\n");
}

function renderPostPage(post, socials) {
  const tags = post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const html = `<!doctype html>
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
      <nav class="page-rail post-rail" aria-label="文章目录" data-post-toc>
        <a href="#post-title" data-rail-link>00 / title</a>
      </nav>
      <article class="post-shell" data-post-source="${escapeHtml(post.sourcePath)}">
        <a class="post-back" href="../articles.html">← 返回文章列表</a>
        <header class="post-header">
          <span class="page-heading__index post-meta-line">
            <span>${escapeHtml(formatDateTime(post.date))}</span>
            <span data-post-word-count>--</span>
            <span data-post-read-time>--</span>
            <span><span data-post-view-count>--</span> 浏览</span>
          </span>
          <h1 id="post-title">${escapeHtml(post.title)}</h1>
          <p>${escapeHtml(post.summary)}</p>
          <div class="article-item__tags">${tags}</div>
        </header>
        <div class="post-content">
${post.bodyHtml}
        </div>
        <section class="post-comments" id="comments" aria-label="评论与回应">
          <div class="post-comments__head">
            <span>comments</span>
            <h2>评论与回应</h2>
          </div>
          <div
            class="giscus-slot"
            data-giscus-comments
            data-repo="maki-cloud7/maki-s-blog"
            data-repo-id="R_kgDOSyizVA"
            data-category="General"
            data-category-id="DIC_kwDOSyizVM4C-orT"
          ></div>
        </section>
      </article>
    </main>

    <footer class="site-footer">
${renderFooterSocial(socials)}
      <div class="footer-bottom">
        <p data-i18n="footer.copy">© 2026 maki. Built for notes, ideas, and experiments.</p>
        <a href="../index.html" data-i18n="footer.back">回到首页</a>
      </div>
    </footer>

    <script src="../script.js?v=${assetVersion}"></script>
  </body>
</html>
`;
  return ensureHeadMeta(html, {
    urlPath: post.url,
    title: `${post.title} - ${siteTitle}`,
    description: post.summary,
  });
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

async function cleanGeneratedPosts() {
  await mkdir(outputDir, { recursive: true });
  const files = await readdir(outputDir);
  await Promise.all(files
    .filter((file) => file.endsWith(".html"))
    .map((file) => unlink(path.join(outputDir, file))));
}

async function main() {
  const posts = await loadPosts();
  const projects = normalizeList(await readJson(projectsFile), "projects");
  const friends = normalizeList(await readJson(friendsFile), "friends");
  const socials = normalizeList(await readJson(socialsFile), "socials");
  globalThis.configuredTags = normalizeList(await readJson(tagsFile), "tags");
  await cleanGeneratedPosts();

  let indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  indexHtml = replaceBetween(indexHtml, "HOME", renderHomeCards(posts));
  indexHtml = replaceFooterSocial(indexHtml, socials);
  indexHtml = ensureHeadMeta(indexHtml, {
    urlPath: "index.html",
    title: siteTitle,
    description: siteDescription,
  });
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
  articlesHtml = replaceFooterSocial(articlesHtml, socials);
  articlesHtml = ensureHeadMeta(articlesHtml, {
    urlPath: "articles.html",
    title: `文章 - ${siteTitle}`,
    description: "maki 的文章列表，收集技术、设计、工作流和生活笔记。",
  });
  articlesHtml = articlesHtml.replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`);
  articlesHtml = articlesHtml.replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "articles.html"), articlesHtml);

  let projectsHtml = await readFile(path.join(root, "projects.html"), "utf8");
  projectsHtml = replaceContentBetween(projectsHtml, "PROJECTS", renderProjects(projects));
  projectsHtml = replaceFooterSocial(projectsHtml, socials);
  projectsHtml = ensureHeadMeta(projectsHtml, {
    urlPath: "projects.html",
    title: `项目 / 作品 - ${siteTitle}`,
    description: "maki 的项目和作品列表。",
  });
  projectsHtml = projectsHtml
    .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
    .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "projects.html"), projectsHtml);

  let friendsHtml = await readFile(path.join(root, "friends.html"), "utf8");
  friendsHtml = replaceContentBetween(friendsHtml, "FRIENDS", renderFriends(friends));
  friendsHtml = replaceFooterSocial(friendsHtml, socials);
  friendsHtml = ensureHeadMeta(friendsHtml, {
    urlPath: "friends.html",
    title: `友链 - ${siteTitle}`,
    description: "maki 的友链和常常回访的角落。",
  });
  friendsHtml = friendsHtml
    .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
    .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
    .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
  await writeFile(path.join(root, "friends.html"), friendsHtml);

  const pageMeta = {
    "about.html": {
      title: `关于 - ${siteTitle}`,
      description: "关于 maki，以及这个长期更新的个人博客。",
    },
    "guestbook.html": {
      title: `留言板 - ${siteTitle}`,
      description: "在 maki 的公开留言板留下想法、问题或建议。",
    },
  };

  for (const file of ["about.html", "guestbook.html"]) {
    const filePath = path.join(root, file);
    let html = await readFile(filePath, "utf8");
    if (file === "guestbook.html") {
      html = renderGuestbookPage(html);
    }
    html = replaceFooterSocial(html, socials);
    html = ensureHeadMeta(html, {
      urlPath: file,
      title: pageMeta[file].title,
      description: pageMeta[file].description,
    });
    html = html
      .replaceAll("styles.css?v=6.0-native-scroll", `styles.css?v=${assetVersion}`)
      .replaceAll("script.js?v=6.0-native-scroll", `script.js?v=${assetVersion}`)
      .replaceAll("styles.css?v=6.0-markdown-posts", `styles.css?v=${assetVersion}`)
      .replaceAll("script.js?v=6.0-markdown-posts", `script.js?v=${assetVersion}`);
    await writeFile(filePath, html);
  }

  for (const post of posts) {
    await writeFile(path.join(outputDir, `${post.slug}.html`), renderPostPage(post, socials));
  }

  await writeFile(path.join(root, "sitemap.xml"), renderSitemap(posts));
  await writeFile(path.join(root, "robots.txt"), renderRobots());
  await writeFile(path.join(root, "favicon.svg"), renderFavicon());
  await writeFile(path.join(root, "404.html"), renderNotFoundPage(socials));

  console.log(`Generated ${posts.length} posts, ${projects.length} projects, and ${friends.length} friends.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
