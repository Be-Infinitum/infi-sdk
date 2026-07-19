import { extractCodeFromUrl, Infi, InfiError } from "@beinfi/sdk";
import { sessionCookieHeader } from "./cookie.js";
import type { CallbackHandlerOptions } from "./types.js";

/**
 * Exchange `?code=…` from hosted login and redirect with session cookie set.
 * Framework-agnostic — pass any Web `Request`, get a Web `Response`.
 */
export async function handleCallback(req: Request, options: CallbackHandlerOptions): Promise<Response> {
  const infi = new Infi({ secretKey: options.secretKey, apiUrl: options.apiUrl });

  try {
    const code = extractCodeFromUrl(req.url);
    if (!code) {
      throw new InfiError("Missing auth code in callback request", 400, "missing_code");
    }

    const result = await infi.exchangeCode(
      code,
      options.sessionMode ? { sessionMode: options.sessionMode } : {},
    );

    const override = await options.onAuth?.(result, req);
    if (override) return override;

    const res = Response.redirect(new URL(options.successUrl, req.url), 302);
    if (result.session?.token) {
      res.headers.append("Set-Cookie", sessionCookieHeader(result.session.token, options.cookie));
    }
    return res;
  } catch (error) {
    if (options.onError) return options.onError(error, req);

    const code = error instanceof InfiError ? error.code ?? "exchange_failed" : "exchange_failed";
    const message = error instanceof Error ? error.message : "Authentication failed";

    if (options.errorUrl) {
      const dest = new URL(options.errorUrl, req.url);
      dest.searchParams.set("error", code);
      dest.searchParams.set("message", message);
      return Response.redirect(dest, 302);
    }

    const status = error instanceof InfiError ? error.status : 500;
    return Response.json({ error: { code, message, fix: error instanceof InfiError ? error.fix : undefined } }, { status });
  }
}

/** Factory for route handlers: `(req) => Promise<Response>`. */
export function createCallbackHandler(
  options: CallbackHandlerOptions,
): (req: Request) => Promise<Response> {
  return (req) => handleCallback(req, options);
}
