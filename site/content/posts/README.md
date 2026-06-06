# Posts

Write blog posts as Markdown files in this folder.

Required front matter:

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

Run this after editing posts:

```sh
node scripts/build-posts.mjs
```
