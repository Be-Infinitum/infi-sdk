// Camada manuscrita (ADR 0055, D3): transporte HTTP.

export interface CallOptions {
  /** Chave de idempotência; gerada (uuid) em mutações quando ausente. */
  idempotencyKey?: string;
  /** Valor de If-Match (hash da prévia/plano). */
  ifMatch?: string;
  channel?: "panel" | "mcp" | "cli" | "api";
}

export interface RequestSpec extends CallOptions {
  method: string;
  /** Template com `{param}`, ex.: `/v1/customers/{customerId}`. */
  path: string;
  pathParams?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
}

export interface TransportConfig {
  secretKey: string;
  apiUrl?: string;
  fetch?: typeof fetch;
  /** Injetável para testes. */
  sleep?: (ms: number) => Promise<void>;
  /** Total de tentativas (padrão 3). */
  maxAttempts?: number;
}

export const SANDBOX_URL = "https://api-sandbox.beinfi.com";
export const LIVE_URL = "https://api.beinfi.com";
const BACKOFF_MS = [250, 1000, 4000];

export class InfiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly tracerId?: string;
  /** Erros por campo (422) ou metadata (409), quando o servidor envia. */
  readonly details?: unknown;
  /** Corpo decodificado da resposta de erro. */
  readonly body?: unknown;

  constructor(init: { status: number; code: string; message: string; tracerId?: string; details?: unknown; body?: unknown }) {
    super(init.message);
    this.name = "InfiError";
    this.status = init.status;
    this.code = init.code;
    this.tracerId = init.tracerId;
    this.details = init.details;
    this.body = init.body;
  }

  /** Em 412, o estado atual devolvido pelo servidor (para reapresentar a prévia). */
  get current(): unknown {
    return this.status === 412 && this.body && typeof this.body === "object" ? (this.body as any).current : undefined;
  }
}

export function parseError(status: number, text: string): InfiError {
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  const nested = body && typeof body.error === "object" && body.error !== null ? body.error : undefined;
  const code = body?.error_code ?? nested?.code ?? `http_${status}`;
  const message = body?.message ?? nested?.message ?? (text || `HTTP ${status}`);
  const tracerId = body?.tracer_id ?? nested?.request_id;
  const details = body?.errors ?? body?.metadata;
  return new InfiError({ status, code, message, tracerId, details, body: body ?? (text || undefined) });
}

export function baseUrlFor(secretKey: string, apiUrl?: string): string {
  if (apiUrl) return apiUrl.replace(/\/+$/, "");
  if (secretKey.startsWith("sk_test_")) return SANDBOX_URL;
  if (secretKey.startsWith("sk_live_")) return LIVE_URL;
  throw new Error("Infi: secretKey deve começar com sk_test_ ou sk_live_ (ou informe apiUrl)");
}

function retryAfterMs(h: string | null): number | undefined {
  if (!h) return undefined;
  const s = Number(h);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const d = Date.parse(h);
  return Number.isNaN(d) ? undefined : Math.max(0, d - Date.now());
}

export class Transport {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(cfg: TransportConfig) {
    if (!cfg.secretKey) throw new Error("Infi: secretKey é obrigatória");
    this.secretKey = cfg.secretKey;
    this.baseUrl = baseUrlFor(cfg.secretKey, cfg.apiUrl);
    this.fetchFn = cfg.fetch ?? ((input, init) => fetch(input, init)) as typeof fetch;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxAttempts = cfg.maxAttempts ?? 3;
  }

  async request(spec: RequestSpec): Promise<unknown> {
    const method = spec.method.toUpperCase();
    const values = spec.pathParams ?? {};
    const path = spec.path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(values[k])));
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(spec.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${this.secretKey}` };
    for (const [k, v] of Object.entries(spec.headers ?? {})) if (v !== undefined) headers[k] = String(v);
    if (method !== "GET" && method !== "HEAD") {
      headers["Idempotency-Key"] = spec.idempotencyKey ?? crypto.randomUUID();
    }
    if (spec.ifMatch !== undefined) headers["If-Match"] = spec.ifMatch;
    if (spec.channel) headers["X-Infi-Channel"] = spec.channel;
    let payload: string | undefined;
    if (spec.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(spec.body);
    }

    let lastErr: InfiError | undefined;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const last = attempt === this.maxAttempts - 1;
      let res: Response;
      try {
        res = await this.fetchFn(url.toString(), { method, headers, body: payload });
      } catch (e) {
        lastErr = new InfiError({ status: 0, code: "network_error", message: (e as Error).message || "network error" });
        if (last) throw lastErr;
        await this.sleep(BACKOFF_MS[attempt] ?? 4000);
        continue;
      }
      const text = await res.text();
      if (res.ok) {
        if (res.status === 204 || text === "") return undefined;
        return JSON.parse(text);
      }
      lastErr = parseError(res.status, text);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || last) throw lastErr;
      await this.sleep(retryAfterMs(res.headers.get("Retry-After")) ?? BACKOFF_MS[attempt] ?? 4000);
    }
    throw lastErr!;
  }
}
