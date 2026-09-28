import { InfiError } from "../errors.js";
import type { Transport } from "../http.js";

/** One site of your store that signs buyers in with Infi (an OAuth client). */
export interface OAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  createdAt: string;
}

/**
 * Your sites that use "Entrar com Infi" (ADR 0007). `upsert` is by name and
 * only ADDS redirect URIs, so `infi sync` and `infi deploy` can call it again
 * and again. Redirect URIs match exactly: https, or http on localhost.
 */
export class OAuthClientsResource {
  constructor(private readonly t: Transport) {}

  list(): Promise<{ data: OAuthClient[] }> {
    return this.t.request("GET", "/account/oauth-clients", { requireSecret: true });
  }

  upsert(input: { name: string; redirectUris: string[] }, idempotencyKey?: string): Promise<OAuthClient> {
    return this.t.request("POST", "/account/oauth-clients", { body: input, requireSecret: true, idempotencyKey });
  }

  setRedirectUris(clientId: string, redirectUris: string[], idempotencyKey?: string): Promise<OAuthClient> {
    return this.t.request("PUT", `/account/oauth-clients/${encodeURIComponent(clientId)}`, {
      body: { redirectUris },
      requireSecret: true,
      idempotencyKey,
    });
  }

  revoke(clientId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/account/oauth-clients/${encodeURIComponent(clientId)}`, {
      requireSecret: true,
      idempotencyKey,
    });
  }
}

export interface LoginSettings {
  /** A new address becomes a customer on its first sign-in (default true). */
  createsCustomer: boolean;
}

export class LoginSettingsResource {
  constructor(private readonly t: Transport) {}

  get(): Promise<LoginSettings> {
    return this.t.request("GET", "/account/login-settings", { requireSecret: true });
  }

  set(input: LoginSettings, idempotencyKey?: string): Promise<LoginSettings> {
    return this.t.request("PUT", "/account/login-settings", { body: input, requireSecret: true, idempotencyKey });
  }
}

export interface SignInTokens {
  /** A buyer token (`bt_`, 30 days): keep it in an HttpOnly cookie, check it with `buyerTokens.verify`. */
  accessToken: string;
  expiresIn: number;
  idToken: string;
  scope: string;
}

/**
 * The server half of "Entrar com Infi": trade the code Infi sent back to your
 * callback for the tokens. Your sk_ is the client secret, so this runs on
 * your server only.
 */
export class SignInResource {
  constructor(
    private readonly apiBase: string,
    private readonly secretKey: string | undefined,
  ) {}

  /** The /oauth/authorize URL a sign-in starts at. */
  authorizeUrl(p: {
    clientId: string;
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
    scope?: string;
    locale?: string;
  }): string {
    const u = new URL(`${this.apiBase}/oauth/authorize`);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", p.clientId);
    u.searchParams.set("redirect_uri", p.redirectUri);
    u.searchParams.set("scope", p.scope ?? "openid email profile purchases");
    u.searchParams.set("state", p.state);
    u.searchParams.set("nonce", p.nonce);
    u.searchParams.set("code_challenge", p.codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    if (p.locale) u.searchParams.set("ui_locales", p.locale);
    return u.toString();
  }

  async exchangeCode(p: { clientId: string; code: string; redirectUri: string; codeVerifier: string }): Promise<SignInTokens> {
    if (!this.secretKey?.startsWith("sk_")) {
      throw new InfiError("exchangeCode needs the secret key (sk_), on your server.", 0, "secret_key_required");
    }
    const res = await fetch(`${this.apiBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: p.code,
        redirect_uri: p.redirectUri,
        client_id: p.clientId,
        client_secret: this.secretKey,
        code_verifier: p.codeVerifier,
      }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new InfiError(String(data.error_description ?? data.error ?? res.statusText), res.status, String(data.error ?? "token_failed"));
    }
    return {
      accessToken: String(data.access_token),
      expiresIn: Number(data.expires_in),
      idToken: String(data.id_token),
      scope: String(data.scope ?? ""),
    };
  }
}
