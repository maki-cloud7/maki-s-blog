import crypto from "node:crypto";

const cookieName = "maki_editor_session";
const stateCookieName = "maki_oauth_state";
const returnCookieName = "maki_oauth_return";
const sessionMaxAge = 60 * 60 * 24 * 7;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.GITHUB_CLIENT_SECRET || "";
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET or GITHUB_CLIENT_SECRET is not configured");
  }
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function encrypt(value) {
  const secret = crypto.createHash("sha256").update(getSessionSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value) {
  const secret = crypto.createHash("sha256").update(getSessionSecret()).digest();
  const [ivRaw, tagRaw, encryptedRaw] = String(value || "").split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secret, Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function appendCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  res.setHeader("Set-Cookie", Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((item) => {
    const [key, ...rest] = item.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

export function createSignedState() {
  const state = crypto.randomBytes(24).toString("base64url");
  return `${state}.${sign(state)}`;
}

export function verifySignedState(value) {
  const [state, signature] = String(value || "").split(".");
  if (!state || !signature) {
    return false;
  }
  const expected = sign(state);
  if (signature.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function setStateCookie(res, value) {
  appendCookie(res, `${stateCookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`);
}

export function clearStateCookie(res) {
  appendCookie(res, `${stateCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

export function getStateCookie(req) {
  return parseCookies(req)[stateCookieName] || "";
}

export function setReturnCookie(res, value) {
  const returnTo = String(value || "").startsWith("/") && !String(value || "").startsWith("//") ? value : "/articles.html";
  appendCookie(res, `${returnCookieName}=${encodeURIComponent(returnTo)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`);
}

export function clearReturnCookie(res) {
  appendCookie(res, `${returnCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

export function getReturnCookie(req) {
  return parseCookies(req)[returnCookieName] || "/articles.html";
}

export function setSessionCookie(res, session) {
  const payload = encrypt(JSON.stringify({
    ...session,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAge,
  }));
  appendCookie(res, `${cookieName}=${encodeURIComponent(payload)}; Path=/; Max-Age=${sessionMaxAge}; HttpOnly; SameSite=Lax; Secure`);
}

export function clearSessionCookie(res) {
  appendCookie(res, `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

export function getSession(req) {
  const cookie = parseCookies(req)[cookieName];
  const decrypted = decrypt(cookie);
  if (!decrypted) {
    return null;
  }

  try {
    const session = JSON.parse(decrypted);
    if (!session.token || !session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getRepoConfig() {
  return {
    owner: process.env.GITHUB_OWNER || "maki-cloud7",
    repo: process.env.GITHUB_REPO || "maki-s-blog",
    branch: process.env.GITHUB_BRANCH || "main",
    allowedLogin: process.env.ALLOWED_GITHUB_LOGIN || "",
  };
}

export function getGithubClientConfig(req) {
  const clientId = requiredEnv("GITHUB_CLIENT_ID");
  const clientSecret = requiredEnv("GITHUB_CLIENT_SECRET");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return {
    clientId,
    clientSecret,
    redirectUri: `${proto}://${host}/api/auth/callback`,
  };
}

export async function githubRequest(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "maki-blog-editor",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function requireAuthorizedSession(req) {
  const session = getSession(req);
  if (!session) {
    const error = new Error("Not signed in");
    error.status = 401;
    throw error;
  }

  const repo = getRepoConfig();
  if (repo.allowedLogin && session.login !== repo.allowedLogin) {
    const error = new Error("This GitHub account is not allowed to edit this site");
    error.status = 403;
    throw error;
  }

  const permission = await githubRequest(`/repos/${repo.owner}/${repo.repo}/collaborators/${session.login}/permission`, {
    token: session.token,
  });
  const allowed = ["admin", "maintain", "write"].includes(permission.permission);
  if (!allowed) {
    const error = new Error("This GitHub account does not have write access");
    error.status = 403;
    throw error;
  }

  return session;
}

export function safePostPath(value) {
  const filePath = String(value || "").trim();
  if (!/^site\/content\/posts\/[a-z0-9][a-z0-9._-]*\.md$/i.test(filePath)) {
    const error = new Error("Invalid post path");
    error.status = 400;
    throw error;
  }
  return filePath;
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function sendError(res, error) {
  sendJson(res, error.status || 500, {
    error: error.message || "Unexpected error",
  });
}
