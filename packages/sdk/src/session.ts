import type { InfiResponseLike, SessionPayload } from "./types.js";
import { SESSION_COOKIE_NAME } from "./types.js";

export interface SetSessionCookieOptions {
  /** Cookie max-age in seconds. Defaults to 7 days. */
  maxAgeSeconds?: number;
  /** Force Secure flag (default: true in production). */
  secure?: boolean;
  /** Cookie path. Default: / */
  path?: string;
}

export function setSessionCookie(
  res: InfiResponseLike,
  session: SessionPayload,
  options: SetSessionCookieOptions = {},
): void {
  const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 7;
  const secure =
    options.secure ??
    (typeof globalThis !== "undefined" &&
      "process" in globalThis &&
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
        "production");
  const path = options.path ?? "/";
  if (!session.token) {
    return;
  }
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
    "HttpOnly",
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  if (session.expiresAt) {
    parts.push(`Expires=${new Date(session.expiresAt).toUTCString()}`);
  }
  res.headers.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: InfiResponseLike, path = "/"): void {
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=${path}; Max-Age=0; SameSite=Lax`,
  );
}
