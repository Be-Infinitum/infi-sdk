import { InfiError, parseErrorResponse } from "./errors.js";
import { extractCodeFromUrl } from "./hosted.js";
import type {
  AuthResult,
  ExchangeCodeOptions,
  HostedAppConfig,
  InfiConfig,
  InfiRequestLike,
  IngestResult,
  SendEmailCodeOptions,
  UsageEvent,
  VerifyEmailCodeOptions,
} from "./types.js";
import { DEFAULT_API_BASE, DEFAULT_AUTH_BASE } from "./types.js";

function isPublishableKey(key: string): boolean {
  return key.startsWith("pk_");
}

function isSecretKey(key: string): boolean {
  return key.startsWith("sk_");
}

export class Infi {
  readonly #secretKey?: string;
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
    this.#baseUrl = (config.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.#authBaseUrl = (config.authBaseUrl ?? DEFAULT_AUTH_BASE).replace(/\/$/, "");
    // No key is required for the public email-code endpoints (sendEmailCode /
    // verifyEmailCode / getAppConfig). The secret key is only needed server-side
    // for exchangeCode and metering, which guard with #requireSecretKey().
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  get authBaseUrl(): string {
    return this.#authBaseUrl;
  }

  // ── Identity: email-code login (public, slug-scoped) ───────────────────────

  /**
   * Send a 6-digit email verification code for the given app slug.
   * Public endpoint — always resolves on success (no account enumeration).
   */
  async sendEmailCode(options: SendEmailCodeOptions): Promise<{ status: "sent" }> {
    const res = await fetch(this.#appUrl(options.slug, "email-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        redirectTo: options.redirectTo,
        state: options.state,
      }),
    });

    if (res.status === 202) {
      return { status: "sent" };
    }
    throw await parseErrorResponse(res);
  }

  /**
   * Verify an email code and obtain the redirect URL carrying a single-use auth code.
   * Navigate the browser to `redirectUrl` to complete the hosted flow.
   */
  async verifyEmailCode(options: VerifyEmailCodeOptions): Promise<{ redirectUrl: string }> {
    const res = await fetch(this.#appUrl(options.slug, "verify-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: options.email, code: options.code }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as { redirectUrl: string };
  }

  /** Fetch public branding/config for an app's hosted login page. */
  async getAppConfig(slug: string): Promise<HostedAppConfig> {
    const res = await fetch(this.#appUrl(slug, "config"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as HostedAppConfig;
  }

  // ── Identity: auth-code exchange (server-side, secret key) ─────────────────

  /** Exchange a single-use auth code for a verified identity and optional session. */
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

  /** Extract auth code from a hosted callback request and exchange it. */
  async exchangeCodeFromRequest(req: InfiRequestLike): Promise<AuthResult> {
    const code = extractCodeFromUrl(req.url);
    if (!code) {
      throw new InfiError("Missing auth code in request", 400, "missing_code");
    }
    return this.exchangeCode(code);
  }

  // ── Metering: usage ingestion (server-side, secret key) ────────────────────

  /** Ingest a single usage event. */
  async track(event: UsageEvent): Promise<IngestResult> {
    this.#requireSecretKey("track");
    const res = await fetch(`${this.#baseUrl}/metering/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as IngestResult;
  }

  /** Ingest a batch of usage events (all-or-nothing). */
  async trackBatch(events: UsageEvent[]): Promise<IngestResult> {
    this.#requireSecretKey("trackBatch");
    const res = await fetch(`${this.#baseUrl}/metering/events/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as IngestResult;
  }

  #appUrl(slug: string, action: string): string {
    return `${this.#baseUrl}/identity/apps/${encodeURIComponent(slug)}/${action}`;
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
