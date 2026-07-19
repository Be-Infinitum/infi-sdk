import { Infi, type SessionIntrospection } from "@beinfi/sdk";
import { readSessionToken } from "./cookie.js";
import type { RequireSessionOptions } from "./types.js";

/** Resolve session from the request cookie. Returns null when absent or invalid. */
export async function getSessionFromRequest(
  req: Request,
  options: RequireSessionOptions,
): Promise<SessionIntrospection | null> {
  const token = readSessionToken(req, options.cookie?.name);
  if (!token) return null;

  const infi = new Infi({ secretKey: options.secretKey, apiUrl: options.apiUrl });
  try {
    return await infi.getSession(token);
  } catch {
    return null;
  }
}

/** Like `getSessionFromRequest` but throws 401 JSON when missing. */
export async function requireSession(
  req: Request,
  options: RequireSessionOptions,
): Promise<SessionIntrospection> {
  const session = await getSessionFromRequest(req, options);
  if (!session?.customer?.id) {
    throw new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}
