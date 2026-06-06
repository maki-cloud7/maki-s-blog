# v8.0 Backup

Date: 2026-06-06

Created from `maki-s-blog-repo/site` at commit `c4df424`.

Included:
- Full static site snapshot from `site/`
- Primary pages, content JSON, Markdown posts, generated post pages, uploaded assets, admin config, API files, build scripts, and deploy metadata

Key preserved state:
- Archive page uses collapsible yearly timeline groups.
- Post pages include code copy buttons, read progress recovery, sticky generated TOC, automatic word count, computed read time, and per-post view counts.
- Read time labels use uppercase `MIN READ` format across article listings and post pages.
- Giscus is configured with GitHub Discussions category `General`.
- Post editor supports creating, editing, deleting posts, choosing/uploading images, and inserting Markdown image syntax.
- Markdown rendering supports images, code blocks, headings without blank lines, lists, blockquotes, horizontal rules, links, emphasis, and inline code.
- Per-post views use `/api/views` with `site/content/views.json`; production persistence requires `VIEWS_GITHUB_TOKEN`.
