import type { StartHostedLoginOptions } from "./types.js";
import { DEFAULT_AUTH_BASE } from "./types.js";

export function buildHostedLoginUrl(options: StartHostedLoginOptions): string {
  const base = (options.authBaseUrl ?? DEFAULT_AUTH_BASE).replace(/\/$/, "");
  const url = new URL(`${base}/identity/apps/${encodeURIComponent(options.slug)}/login`);
  url.searchParams.set("redirect_uri", options.redirectTo);
  if (options.state) {
    url.searchParams.set("state", options.state);
  }
  return url.toString();
}

export function startHostedLogin(options: StartHostedLoginOptions): void {
  if (typeof window === "undefined") {
    throw new Error("startHostedLogin must be called in the browser");
  }
  window.location.assign(buildHostedLoginUrl(options));
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

export function extractCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("code");
  } catch {
    return null;
  }
}
