import { InfiError, parseErrorResponse } from "./errors.js";
import { extractCodeFromUrl, extractTokenFromUrl } from "./hosted.js";
import type {
  AuthResult,
  ExchangeCodeOptions,
  InfiConfig,
  InfiRequestLike,
  SendMagicLinkOptions,
  ValidateMagicLinkOptions,
} from "./types.js";
import { DEFAULT_API_BASE, DEFAULT_AUTH_BASE } from "./types.js";

function isPublishableKey(key: string): boolean {
  return key.startsWith("pk_");
}

function isSecretKey(key: string): boolean {
  return key.startsWith("sk_");
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

export class Infi {
  readonly #secretKey?: string;
  readonly #publishableKey?: string;
  readonly #baseUrl: string;
  readonly #authBaseUrl: string;

  constructor(config: InfiConfig | string) {
    if (typeof config === "string") {
      if (!isSecretKey(config)) {
        throw new InfiError("Infi constructor expects a secret key (sk_...)", 400, "invalid_key");
      }
      this.#secretKey = config;
      this.#baseUrl = DEFAULT_API_BASE;
      this.#authBaseUrl = DEFAULT_AUTH_BASE;
      return;
    }

    this.#secretKey = config.secretKey;
    this.#publishableKey = config.publishableKey;
    this.#baseUrl = (config.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.#authBaseUrl = (config.authBaseUrl ?? DEFAULT_AUTH_BASE).replace(/\/$/, "");

    if (!this.#secretKey && !this.#publishableKey) {
      throw new InfiError("Infi requires secretKey and/or publishableKey", 400, "missing_key");
    }
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  get authBaseUrl(): string {
    return this.#authBaseUrl;
  }

  async sendMagicLink(options: SendMagicLinkOptions): Promise<{ status: "sent" }> {
    const key = this.#pickKeyForSend();
    const res = await fetch(`${this.#baseUrl}/identity/magic-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: options.email,
        redirectTo: options.redirectTo,
        mode: options.mode,
        state: options.state,
      }),
    });

    if (res.status === 202) {
      return { status: "sent" };
    }
    throw await parseErrorResponse(res);
  }

  async validateMagicLink(
    token: string,
    options: ValidateMagicLinkOptions = {},
  ): Promise<AuthResult> {
    this.#requireSecretKey("validateMagicLink");
    const res = await fetch(`${this.#baseUrl}/identity/validate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        sessionMode: options.sessionMode,
      }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as AuthResult;
  }

  async exchangeCode(code: string, options: ExchangeCodeOptions = {}): Promise<AuthResult> {
    this.#requireSecretKey("exchangeCode");
    const res = await fetch(`${this.#baseUrl}/identity/exchange`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        sessionMode: options.sessionMode,
      }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as AuthResult;
  }

  /** Extract token from a callback request and validate it. */
  async validateMagicLinkFromRequest(req: InfiRequestLike): Promise<AuthResult> {
    const token = await this.#extractTokenFromRequest(req);
    if (!token) {
      throw new InfiError("Missing magic-link token in request", 400, "missing_token");
    }
    return this.validateMagicLink(token);
  }

  /** Extract auth code from a hosted callback request and exchange it. */
  async exchangeCodeFromRequest(req: InfiRequestLike): Promise<AuthResult> {
    const code = extractCodeFromUrl(req.url);
    if (!code) {
      throw new InfiError("Missing auth code in request", 400, "missing_code");
    }
    return this.exchangeCode(code);
  }

  async #extractTokenFromRequest(req: InfiRequestLike): Promise<string | null> {
    const fromUrl = extractTokenFromUrl(req.url);
    if (fromUrl) return fromUrl;

    const contentType = headerValue(req.headers, "content-type") ?? "";
    if (contentType.includes("application/json") && req.json) {
      try {
        const body = (await req.json()) as { token?: string };
        if (body.token) return body.token;
      } catch {
        // fall through
      }
    }

    return null;
  }

  #pickKeyForSend(): string {
    if (this.#publishableKey) {
      return this.#publishableKey;
    }
    if (this.#secretKey) {
      return this.#secretKey;
    }
    throw new InfiError("sendMagicLink requires publishableKey or secretKey", 400, "missing_key");
  }

  #requireSecretKey(method: string): void {
    if (!this.#secretKey) {
      throw new InfiError(`${method} requires a secret key (sk_...)`, 400, "missing_secret_key");
    }
    if (isPublishableKey(this.#secretKey)) {
      throw new InfiError(`${method} cannot use a publishable key`, 403, "invalid_key_kind");
    }
  }
}
