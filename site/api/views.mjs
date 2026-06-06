import { getRepoConfig, githubRequest, sendError, sendJson } from "./_lib/github.mjs";

const viewsPath = "site/content/views.json";

function decodeContent(content) {
  return Buffer.from(content || "", "base64").toString("utf8");
}

function encodeContent(content) {
  return Buffer.from(content || "", "utf8").toString("base64");
}

function safeViewKey(value = "") {
  const key = String(value || "").trim();
  if (!/^\/posts\/[a-z0-9\u4e00-\u9fa5._%/-]+\.html$/i.test(key) || key.includes("..")) {
    const error = new Error("Invalid view key");
    error.status = 400;
    throw error;
  }
  return decodeURI(key);
}

async function readViews(repo, token) {
  try {
    const file = await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${viewsPath}?ref=${repo.branch}`, {
      token,
    });
    const views = JSON.parse(decodeContent(file.content) || "{}");
    return { views, sha: file.sha };
  } catch (error) {
    if (error.status === 404) {
      return { views: {}, sha: "" };
    }
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    const repo = getRepoConfig();
    const token = process.env.VIEWS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
    const url = new URL(req.url, `https://${req.headers.host}`);
    const key = safeViewKey(url.searchParams.get("path"));

    if (req.method === "GET") {
      const { views } = await readViews(repo, token);
      sendJson(res, 200, { count: Number(views[key] || 0), writable: Boolean(token) });
      return;
    }

    if (req.method === "POST") {
      const { views, sha } = await readViews(repo, token);
      const count = Number(views[key] || 0);

      if (!token) {
        sendJson(res, 200, { count, writable: false });
        return;
      }

      views[key] = count + 1;
      await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${viewsPath}`, {
        token,
        method: "PUT",
        body: {
          message: `Update view count: ${key}`,
          content: encodeContent(`${JSON.stringify(views, null, 2)}\n`),
          ...(sha ? { sha } : {}),
          branch: repo.branch,
        },
      });

      sendJson(res, 200, { count: views[key], writable: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendError(res, error);
  }
}
