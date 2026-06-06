import {
  getRepoConfig,
  githubRequest,
  requireAuthorizedSession,
  safePostPath,
  sendError,
  sendJson,
} from "./_lib/github.mjs";

function decodeContent(content) {
  return Buffer.from(content || "", "base64").toString("utf8");
}

function encodeContent(content) {
  return Buffer.from(content || "", "utf8").toString("base64");
}

export default async function handler(req, res) {
  try {
    const session = await requireAuthorizedSession(req);
    const repo = getRepoConfig();

    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const filePath = safePostPath(url.searchParams.get("path"));
      const file = await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath).replaceAll("%2F", "/")}?ref=${repo.branch}`, {
        token: session.token,
      });
      sendJson(res, 200, {
        path: filePath,
        sha: file.sha,
        content: decodeContent(file.content),
      });
      return;
    }

    if (req.method === "PUT") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const filePath = safePostPath(body.path);
      const content = String(body.content || "");
      const sha = String(body.sha || "");
      const message = String(body.message || "Update post from site editor").slice(0, 180);
      const result = await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath).replaceAll("%2F", "/")}`, {
        token: session.token,
        method: "PUT",
        body: {
          message,
          content: encodeContent(content),
          ...(sha ? { sha } : {}),
          branch: repo.branch,
        },
      });

      sendJson(res, 200, {
        ok: true,
        commit: result.commit?.sha,
        sha: result.content?.sha,
        url: result.commit?.html_url,
      });
      return;
    }

    if (req.method === "DELETE") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const filePath = safePostPath(body.path);
      const sha = String(body.sha || "");
      const message = String(body.message || "Delete post from site editor").slice(0, 180);
      const current = sha ? { sha } : await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath).replaceAll("%2F", "/")}?ref=${repo.branch}`, {
        token: session.token,
      });
      const result = await githubRequest(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath).replaceAll("%2F", "/")}`, {
        token: session.token,
        method: "DELETE",
        body: {
          message,
          sha: current.sha,
          branch: repo.branch,
        },
      });

      sendJson(res, 200, {
        ok: true,
        commit: result.commit?.sha,
        url: result.commit?.html_url,
      });
      return;
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendError(res, error);
  }
}
