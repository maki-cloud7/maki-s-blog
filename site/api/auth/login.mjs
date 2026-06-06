import { createSignedState, getGithubClientConfig, setReturnCookie, setStateCookie } from "../_lib/github.mjs";

export default function handler(req, res) {
  try {
    const { clientId, redirectUri } = getGithubClientConfig(req);
    const url = new URL(req.url, `https://${req.headers.host}`);
    const state = createSignedState();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "repo",
      state,
    });

    setStateCookie(res, state);
    setReturnCookie(res, url.searchParams.get("next") || "/articles.html");
    res.statusCode = 302;
    res.setHeader("Location", `https://github.com/login/oauth/authorize?${params}`);
    res.end();
  } catch (error) {
    res.statusCode = 500;
    res.end(error.message);
  }
}
