import { Infi } from "@beinfi/sdk";
import { getSessionFromRequest } from "./session.js";
import type { StateHandlerOptions } from "./types.js";

/**
 * `GET` handler that returns `customers.state()` JSON for the signed-in user.
 * Drop-in for `/api/state` in SPAs — secret key stays server-side.
 */
export async function handleState(req: Request, options: StateHandlerOptions): Promise<Response> {
  const session = await getSessionFromRequest(req, {
    secretKey: options.secretKey,
    apiUrl: options.apiUrl,
    cookie: options.cookie,
  });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const customerId = await options.resolveCustomerId(req, session);
  if (!customerId) {
    return Response.json(
      { error: "missing_customer", message: "Could not resolve enrollment/customer id." },
      { status: 400 },
    );
  }

  const infi = new Infi({ secretKey: options.secretKey, apiUrl: options.apiUrl });
  return Response.json(await infi.customers.state(customerId));
}

/** Factory for route handlers: `(req) => Promise<Response>`. */
export function createStateHandler(options: StateHandlerOptions): (req: Request) => Promise<Response> {
  return (req) => handleState(req, options);
}
