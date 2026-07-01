import { buildHostedLoginUrl } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { LoginOptions } from "./types.js";

/**
 * App Router `GET` handler that redirects the browser to Infi's hosted login.
 *
 * ```ts
 * // app/api/auth/login/route.ts
 * export const GET = Login({ slug: process.env.INFI_APP_SLUG!, redirectTo: "/api/auth/callback" })
 * ```
 */
export function Login(options: LoginOptions) {
  return function GET(req: NextRequest): NextResponse {
    const redirectTo = new URL(options.redirectTo, req.url).toString();
    const state = typeof options.state === "function" ? options.state(req) : options.state;
    const url = buildHostedLoginUrl({
      slug: options.slug,
      redirectTo,
      authBaseUrl: options.authBaseUrl,
      state,
    });
    return NextResponse.redirect(url);
  };
}
