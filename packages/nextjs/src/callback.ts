import { extractCodeFromUrl, Infi, InfiError, setSessionCookie } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { CallbackOptions } from "./types.js";

/**
 * App Router `GET` handler for the hosted-login callback. Exchanges the
 * single-use `?code=…` for a session, sets the session cookie, and redirects
 * to `successUrl`. Collapses the hand-written callback boilerplate into one line.
 *
 * ```ts
 * // app/api/auth/callback/route.ts
 * export const GET = Callback({ secretKey: process.env.INFI_SECRET_KEY!, successUrl: "/dashboard" })
 * ```
 */
export function Callback(options: CallbackOptions) {
  const infi = new Infi({ secretKey: options.secretKey, apiUrl: options.apiUrl });

  return async function GET(req: NextRequest): Promise<NextResponse> {
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
      if (override) {
        return override;
      }

      const res = NextResponse.redirect(new URL(options.successUrl, req.url));
      if (result.session) {
        setSessionCookie(res, result.session, options.cookie);
      }
      return res;
    } catch (error) {
      if (options.onError) {
        return options.onError(error, req);
      }
      const code = error instanceof InfiError ? error.code ?? "exchange_failed" : "exchange_failed";
      const message = error instanceof Error ? error.message : "Authentication failed";
      // Bounce back to the login page with the failure in the query so it can be
      // shown, instead of dumping a JSON error the user lands on.
      if (options.errorUrl) {
        const dest = new URL(options.errorUrl, req.url);
        dest.searchParams.set("error", code);
        dest.searchParams.set("message", message);
        return NextResponse.redirect(dest);
      }
      const status = error instanceof InfiError ? error.status : 500;
      return NextResponse.json({ error: { message } }, { status });
    }
  };
}
