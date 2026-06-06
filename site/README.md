# maki's blog

Final site version: v6.0.

This is a static personal website. Content is edited in `content/` and generated into static HTML pages.

## Deploy With Vercel

Recommended settings:

- Framework Preset: Other
- Build Command: `node scripts/build-site.mjs`
- Output Directory: `.`

The same settings are also stored in `vercel.json`.

## Edit Posts

Create a Markdown file in `content/posts/`.

```md
---
title: 文章标题
date: 2026-06-06
tags: Notes, Workflow
summary: 一句话摘要，会出现在首页和文章列表。
readTime: 5 min read
draft: false
---

正文从这里开始。
```

Then run:

```sh
node scripts/build-site.mjs
```

The script updates:

- `index.html`
- `articles.html`
- `projects.html`
- `friends.html`
- `posts/*.html`

## Edit Tags

Post tags are declared inside each Markdown file:

```md
tags: Notes, Workflow
```

To keep a tag visible in the filter even before many posts use it, add it to `content/tags.json`.

## Edit Projects

Edit `content/projects.json`.

```json
{
  "id": "my-project",
  "title": "My Project",
  "tag": "tools",
  "summary": "项目简介。",
  "meta": "stack / status",
  "url": "https://example.com"
}
```

## Edit Friends

Edit `content/friends.json`.

```json
{
  "id": "friend-blog",
  "name": "Friend Blog",
  "description": "友链简介。",
  "meta": "design / life",
  "avatar": "F",
  "url": "https://example.com"
}
```

## Edit Other Pages

- Projects: edit `content/projects.json`
- Friends: edit `content/friends.json`
- About: edit `about.html`
- Guestbook page copy: edit `guestbook.html`
- Shared text and language labels: edit `script.js`
- Visual style: edit `styles.css`

## Deploy

Deploy this folder as a static site. No build command is required if you already ran `node scripts/build-posts.mjs` before uploading.

If the hosting platform supports build commands, use:

```sh
node scripts/build-site.mjs
```

Publish directory:

```text
/
```
