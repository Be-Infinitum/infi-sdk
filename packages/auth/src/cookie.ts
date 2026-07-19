import { SESSION_COOKIE_NAME } from "@beinfi/sdk";
import type { CookieOptions } from "./types.js";

/** Parse `Cookie` header and return the Infi session token, if present. */
export function readSessionToken(req: Request, name = SESSION_COOKIE_NAME): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey?.trim() === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return undefined;
}

/** Build a `Set-Cookie` header value for an Infi session token. */
export function sessionCookieHeader(token: string, options: CookieOptions = {}): string {
  const name = options.name ?? SESSION_COOKIE_NAME;
  const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 7;
  const path = options.path ?? "/";
  const secure =
    options.secure ??
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production");

  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "HttpOnly",
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Append session cookie to a Response (returns the same instance). */
export function withSessionCookie(res: Response, token: string, options?: CookieOptions): Response {
  res.headers.append("Set-Cookie", sessionCookieHeader(token, options));
  return res;
}
