import { clearSessionCookie } from "../_lib/github.mjs";

export default function handler(req, res) {
  clearSessionCookie(res);
  res.statusCode = 302;
  res.setHeader("Location", "/");
  res.end();
}
