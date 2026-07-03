import type { StartHostedLoginOptions } from "./types.js";
import { DEFAULT_HOSTED_LOGIN_BASE } from "./types.js";

export function buildHostedLoginUrl(options: StartHostedLoginOptions): string {
  // Link straight to the frontend-hosted login page (`/identity/{slug}/login`).
  // No `/apps/` — that path is the backend's legacy 302-bouncer; the frontend page
  // validates the app + redirect_uri itself and runs the email-code flow.
  const base = (options.authBaseUrl ?? DEFAULT_HOSTED_LOGIN_BASE).replace(/\/$/, "");
  const url = new URL(`${base}/identity/${encodeURIComponent(options.slug)}/login`);
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
