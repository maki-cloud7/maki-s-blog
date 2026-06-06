import {
  clearStateCookie,
  clearReturnCookie,
  getGithubClientConfig,
  getRepoConfig,
  getReturnCookie,
  getStateCookie,
  githubRequest,
  setSessionCookie,
  verifySignedState,
} from "../_lib/github.mjs";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = getStateCookie(req);

    if (!code || !state || state !== savedState || !verifySignedState(state)) {
      res.statusCode = 400;
      res.end("Invalid OAuth state");
      return;
    }

    const { clientId, clientSecret, redirectUri } = getGithubClientConfig(req);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        state,
      }),
    });
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      res.statusCode = 401;
      res.end(tokenData.error_description || "GitHub OAuth failed");
      return;
    }

    const user = await githubRequest("/user", { token: tokenData.access_token });
    const repo = getRepoConfig();

    if (repo.allowedLogin && user.login !== repo.allowedLogin) {
      clearStateCookie(res);
      res.statusCode = 403;
      res.end("This GitHub account is not allowed to edit this site");
      return;
    }

    const permission = await githubRequest(`/repos/${repo.owner}/${repo.repo}/collaborators/${user.login}/permission`, {
      token: tokenData.access_token,
    });
    if (!["admin", "maintain", "write"].includes(permission.permission)) {
      clearStateCookie(res);
      res.statusCode = 403;
      res.end("This GitHub account does not have write access");
      return;
    }

    const returnTo = getReturnCookie(req);
    clearStateCookie(res);
    clearReturnCookie(res);
    setSessionCookie(res, {
      token: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url,
    });

    res.statusCode = 302;
    res.setHeader("Location", returnTo);
    res.end();
  } catch (error) {
    res.statusCode = error.status || 500;
    res.end(error.message || "OAuth callback failed");
  }
}
