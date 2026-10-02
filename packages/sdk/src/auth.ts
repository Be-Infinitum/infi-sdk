import { Infi } from "./client.js";
import { InfiError } from "./errors.js";
import { buyerHas, type VerifiedBuyer } from "./resources/buyer-tokens.js";

/**
 * "Entrar com Infi" on your server (OAuth 2.1 + PKCE, ADR 0007 in the
 * backend), on Web standards only (`Request`, `Response`, `crypto.subtle`), so
 * the same code runs on Next, Remix, Hono, Bun or a Cloudflare Worker.
 *
 * The button (`<LoginElement>` in @beinfi/elements-react) goes to
 * `{basePath}/sign-in`; Infi signs the person in on its own page and sends them
 * back to `{basePath}/callback`, where this trades the code with your sk_ and
 * keeps the buyer token in an HttpOnly cookie. Anyone may sign in, bought or
 * not.
 *
 *   const auth = createInfiAuth();
 *   // Next: app/api/infi/auth/[[...infi]]/route.ts
 *   export const GET = auth.handle, DELETE = auth.handle;
 *   // any server component / route
 *   const buyer = await auth.getBuyer(await headers());   // or (request)
 *   if (!buyer?.has("ecommerce/club")) redirect("/sign-in?next=/members");
 */
export interface InfiAuthOptions {
  /** Default `INFI_SECRET_KEY`. */
  secretKey?: string;
  /** Default `INFI_API_URL`, else the host the key's prefix names. */
  apiUrl?: string;
  /** This site's OAuth client (`infi sync` writes it). Default `INFI_CLIENT_ID`. */
  clientId?: string;
  /**
   * This site's public origin, for the redirect URI. Default `INFI_SITE_URL`,
   * else the request's own origin — set it behind a proxy that rewrites Host.
   */
  siteUrl?: string;
  /** Where the routes are mounted. Default `/api/infi/auth`. */
  basePath?: string;
  /** Default `infi_buyer`. */
  cookieName?: string;
  /** `Secure` on the cookies. Default: when the site is served over https. */
  secureCookies?: boolean;
}

export interface SignedInBuyer extends VerifiedBuyer {
  /** Bought (and not refunded) or subscribed and running, by manifest key or product id. */
  has(keyOrProductId: string): boolean;
}

/** Anything that carries the request's cookies: a Request, Headers, or Next's headers(). */
export type CookieSource = Request | Headers | { get(name: string): string | null | undefined };

const TOKEN = /^bt_[0-9a-f]{64}$/;
const FLOW_COOKIE = "infi_oauth";

const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function random(): string {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

async function s256(verifier: string): Promise<string> {
  const sum = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(sum));
}

/** Only a path on this site: an absolute URL here would be an open redirect. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

function idTokenNonce(idToken: string): string | undefined {
  try {
    const payload = idToken.split(".")[1] ?? "";
    return (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { nonce?: string }).nonce;
  } catch {
    return undefined;
  }
}

function readCookie(source: CookieSource, name: string): string | undefined {
  const header = source instanceof Request ? source.headers.get("cookie") : source.get("cookie");
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function cookie(
  name: string,
  value: string,
  o: { path: string; maxAge: number; secure: boolean },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path}`, `Max-Age=${o.maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

function redirect(to: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: to, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}

function json(body: unknown, cookies: string[] = []): Response {
  const h = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status: 200, headers: h });
}

export function createInfiAuth(opts: InfiAuthOptions = {}) {
  const cookieName = opts.cookieName ?? "infi_buyer";
  const basePath = (opts.basePath ?? "/api/infi/auth").replace(/\/$/, "");
  let client: Infi | undefined;
  const infi = () => {
    if (client) return client;
    const secretKey = opts.secretKey ?? env("INFI_SECRET_KEY");
    if (!secretKey?.startsWith("sk_")) throw new Error("createInfiAuth: INFI_SECRET_KEY is missing (run `infi login`).");
    client = new Infi({ secretKey, apiUrl: opts.apiUrl ?? env("INFI_API_URL") });
    return client;
  };
  const clientId = () => {
    const id = opts.clientId ?? env("INFI_CLIENT_ID");
    if (!id) throw new Error("createInfiAuth: INFI_CLIENT_ID is missing (run `infi sync`, which registers this site).");
    return id;
  };
  const siteOrigin = (req: Request) =>
    (opts.siteUrl ?? env("INFI_SITE_URL") ?? new URL(req.url).origin).replace(/\/$/, "");
  const redirectUri = (req: Request) => `${siteOrigin(req)}${basePath}/callback`;
  const secure = (req: Request) => opts.secureCookies ?? siteOrigin(req).startsWith("https://");

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

  /** The raw token, for <PortalElement token> from a server component. */
  function getToken(source: CookieSource): string | null {
    const token = readCookie(source, cookieName);
    return token && TOKEN.test(token) ? token : null;
  }

  /** The signed-in person on this request, read fresh (access included). */
  async function getBuyer(source: CookieSource): Promise<SignedInBuyer | null> {
    const token = getToken(source);
    return token ? verify(token) : null;
  }

  const strip = (b: SignedInBuyer | null) => {
    if (!b) return null;
    const { has: _has, ...data } = b;
    return data;
  };

  async function signIn(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const verifier = random();
    const state = random();
    const nonce = random();
    const flow = JSON.stringify({ state, verifier, nonce, next: safeNext(url.searchParams.get("next")) });
    const to = infi().signIn.authorizeUrl({
      clientId: clientId(),
      redirectUri: redirectUri(req),
      state,
      nonce,
      codeChallenge: await s256(verifier),
      locale: url.searchParams.get("locale") ?? undefined,
    });
    return redirect(to, [cookie(FLOW_COOKIE, flow, { path: basePath, maxAge: 600, secure: secure(req) })]);
  }

  async function callback(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const clearFlow = cookie(FLOW_COOKIE, "", { path: basePath, maxAge: 0, secure: secure(req) });
    let flow: { state: string; verifier: string; nonce: string; next: string } | undefined;
    try {
      const raw = readCookie(req, FLOW_COOKIE);
      flow = raw ? JSON.parse(raw) : undefined;
    } catch {
      flow = undefined;
    }
    const back = (path: string, error?: string, extra: string[] = []) => {
      const to = new URL(path, siteOrigin(req));
      if (error) to.searchParams.set("infi_error", error);
      return redirect(to.toString(), [clearFlow, ...extra]);
    };
    // A callback this browser did not start (or started too long ago) is
    // refused: the state is what ties the code to this session.
    if (!flow || url.searchParams.get("state") !== flow.state) return back("/", "invalid_state");
    const error = url.searchParams.get("error");
    if (error) return back(flow.next, url.searchParams.get("error_description") ?? error);
    const code = url.searchParams.get("code");
    if (!code) return back(flow.next, "missing_code");
    const tokens = await infi().signIn.exchangeCode({
      clientId: clientId(),
      code,
      redirectUri: redirectUri(req),
      codeVerifier: flow.verifier,
    });
    if (idTokenNonce(tokens.idToken) !== flow.nonce) return back(flow.next, "invalid_nonce");
    return back(flow.next, undefined, [
      cookie(cookieName, tokens.accessToken, { path: "/", maxAge: tokens.expiresIn, secure: secure(req) }),
    ]);
  }

  async function signOut(req: Request): Promise<Response> {
    const token = getToken(req);
    if (token) {
      // The cookie goes either way; a failed revoke leaves a token nobody
      // holds, which expires on its own.
      await infi().buyerTokens.revoke({ token }).catch(() => undefined);
    }
    return json({ buyer: null }, [cookie(cookieName, "", { path: "/", maxAge: 0, secure: secure(req) })]);
  }

  /**
   * The one route handler: GET `{basePath}` who is signed in, GET `/sign-in`
   * start, GET `/callback` Infi sends the person back, DELETE sign out of this
   * site (Infi's own session is Infi's, on its page).
   */
  async function handle(req: Request): Promise<Response> {
    const tail = new URL(req.url).pathname.replace(/\/$/, "").slice(basePath.length);
    if (req.method === "DELETE") return signOut(req);
    if (tail === "/sign-in") return signIn(req);
    if (tail === "/callback") return callback(req);
    return json({ buyer: strip(await getBuyer(req)) });
  }

  return { handle, getBuyer, getToken, verify, cookieName, basePath };
}
