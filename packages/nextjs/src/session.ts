import { Infi, SESSION_COOKIE_NAME, type SessionIntrospection } from "@beinfi/sdk";
import { cookies } from "next/headers";

export interface GetSessionOptions {
  /** Secret key (`sk_...`) used to resolve the token server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the SDK's DEFAULT_API_BASE. */
  baseUrl?: string;
}

/**
 * Read the Infi session token from the request cookies, for protecting routes
 * or pages. Read-side counterpart to `setSessionCookie`.
 *
 * ```ts
 * const token = await getSessionToken()
 * if (!token) redirect("/api/auth/login")
 * ```
 */
export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Resolve the current session from the infi_session cookie to its identity and
 * customer. Returns null when there is no cookie or the token is invalid/expired.
 *
 * ```ts
 * const session = await getSession({ secretKey: process.env.INFI_SECRET_KEY! })
 * if (!session) redirect("/api/auth/login")
 * session.customer?.id // the current customer
 * ```
 */
export async function getSession(
  options: GetSessionOptions,
): Promise<SessionIntrospection | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const infi = new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl });
  try {
    return await infi.getSession(token);
  } catch {
    return null;
  }
}
