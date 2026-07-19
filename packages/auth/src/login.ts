import { buildHostedLoginUrl } from "@beinfi/sdk";
import type { LoginHandlerOptions } from "./types.js";

/**
 * Redirect the browser to Infi hosted login. Works in any runtime that speaks
 * Web `Request`/`Response` (Hono, Express via adapter, Cloudflare Workers, etc.).
 */
export function loginRedirect(req: Request, options: LoginHandlerOptions): Response {
  const redirectTo = new URL(options.redirectTo, req.url).toString();
  const state = typeof options.state === "function" ? options.state(req) : options.state;
  const url = buildHostedLoginUrl({
    slug: options.slug,
    redirectTo,
    appUrl: options.authBaseUrl,
    state,
  });
  return Response.redirect(url, 302);
}

/** Factory for route handlers: `(req) => Response`. */
export function createLoginHandler(options: LoginHandlerOptions): (req: Request) => Response {
  return (req) => loginRedirect(req, options);
}
