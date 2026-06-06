import { getSession, requireAuthorizedSession, sendJson } from "./_lib/github.mjs";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 200, { authenticated: false, authorized: false });
    return;
  }

  try {
    await requireAuthorizedSession(req);
    sendJson(res, 200, {
      authenticated: true,
      authorized: true,
      login: session.login,
      avatarUrl: session.avatarUrl,
    });
  } catch (error) {
    sendJson(res, 200, {
      authenticated: true,
      authorized: false,
      login: session.login,
      error: error.message,
    });
  }
}
