import { InfiError, parseErrorResponse } from "./errors.js";

/** Best-effort unique id for the Idempotency-Key header (crypto.randomUUID with a fallback). */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Requires a secret key; throws if the client was created without one. */
  requireSecret?: boolean;
  /** Client-supplied key for safe retries (Idempotency-Key header). */
  idempotencyKey?: string;
}

/** Shared fetch layer for the resource clients. Bearer sk_ + JSON in/out. */
export class Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey?: string,
  ) {}

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    if (opts.requireSecret && !this.secretKey) {
      throw new InfiError(`${method} ${path} requires a secret key (sk_...)`, 400, "missing_secret_key");
    }

    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.secretKey) headers.Authorization = `Bearer ${this.secretKey}`;
    // Mutations need an Idempotency-Key; auto-generate one per call when the caller
    // didn't supply a stable key, so every write is safe without extra boilerplate.
    const isMutation = method !== "GET" && method !== "HEAD";
    const idempotencyKey = opts.idempotencyKey ?? (isMutation ? newIdempotencyKey() : undefined);
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) throw await parseErrorResponse(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
