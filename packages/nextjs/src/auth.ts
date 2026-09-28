import { Infi, InfiError, buyerHas, type VerifiedBuyer } from "@beinfi/sdk";
import { cookies } from "next/headers";

/**
 * The store's login on your Next app: `<LoginElement>` (in
 * @beinfi/elements-react) signs the person in with an e-mailed code and hands
 * the `bt_` to your route; the route checks it with your `sk_` and keeps it in
 * an HttpOnly cookie, so no script on the page can read it. Anyone may sign
 * in, bought or not.
 *
 *   // lib/auth.ts
 *   export const auth = createInfiAuth();
 *   // app/api/infi/auth/route.ts
 *   export const { GET, POST, DELETE } = auth.handlers;
 *   // any server component / route
 *   const buyer = await auth.getBuyer();
 *   if (!buyer?.has("ecommerce/curso")) redirect("/entrar");
 */
export interface InfiAuthOptions {
  /** Default `INFI_SECRET_KEY`. */
  secretKey?: string;
  /** Default `INFI_API_URL`, else the host the key's prefix names. */
  apiUrl?: string;
  /** Default `infi_buyer`. */
  cookieName?: string;
}

export interface SignedInBuyer extends VerifiedBuyer {
  /** Bought (and not refunded) or subscribed and still running, by manifest key or product id. */
  has(keyOrProductId: string): boolean;
}

const TOKEN = /^bt_[0-9a-f]{64}$/;

export function createInfiAuth(opts: InfiAuthOptions = {}) {
  const cookieName = opts.cookieName ?? "infi_buyer";
  let client: Infi | undefined;
  const infi = () => {
    if (client) return client;
    const secretKey = opts.secretKey ?? process.env.INFI_SECRET_KEY;
    if (!secretKey?.startsWith("sk_")) throw new Error("createInfiAuth: INFI_SECRET_KEY is missing (run `infi login`).");
    client = new Infi({ secretKey, apiUrl: opts.apiUrl ?? process.env.INFI_API_URL });
    return client;
  };

  /** null for an expired, revoked or foreign token; other failures throw. */
  async function verify(token: string): Promise<SignedInBuyer | null> {
    if (!TOKEN.test(token)) return null;
    try {
      const v = await infi().buyerTokens.verify(token);
      return { ...v, has: (k: string) => buyerHas(v, k) };
    } catch (err) {
      if (err instanceof InfiError && err.status === 401) return null;
      throw err;
    }
  }

  /** The signed-in person on this request, read fresh (access included). */
  async function getBuyer(): Promise<SignedInBuyer | null> {
    const token = (await cookies()).get(cookieName)?.value;
    return token ? verify(token) : null;
  }

  /**
   * The raw token, for handing to <PortalElement> from a server component so
   * the signed-in person's "Minhas compras" opens without a second code.
   */
  async function getToken(): Promise<string | null> {
    const token = (await cookies()).get(cookieName)?.value;
    return token && TOKEN.test(token) ? token : null;
  }

  const strip = (b: SignedInBuyer | null) => {
    if (!b) return null;
    const { has: _has, ...data } = b;
    return data;
  };

  const handlers = {
    async GET(): Promise<Response> {
      return Response.json({ buyer: strip(await getBuyer()) }, { headers: { "Cache-Control": "no-store" } });
    },
    async POST(req: Request): Promise<Response> {
      const body = (await req.json().catch(() => ({}))) as { token?: unknown };
      const token = typeof body.token === "string" ? body.token : "";
      const buyer = await verify(token);
      if (!buyer) return Response.json({ error: "invalid_token" }, { status: 401 });
      (await cookies()).set(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(buyer.expiresAt),
      });
      return Response.json({ buyer: strip(buyer) }, { headers: { "Cache-Control": "no-store" } });
    },
    async DELETE(): Promise<Response> {
      const jar = await cookies();
      const token = jar.get(cookieName)?.value;
      jar.delete(cookieName);
      if (token && TOKEN.test(token)) {
        // The cookie is gone either way; a failed revoke leaves a token
        // nobody holds, which expires on its own.
        await infi().buyerTokens.revoke({ token }).catch(() => undefined);
      }
      return Response.json({ buyer: null });
    },
  };

  return { handlers, getBuyer, getToken, verify, cookieName };
}
