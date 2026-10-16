/**
 * A fake of the backend's /config routes (ADR 0025), for tests. It records
 * every request and answers from a script, so a test can say "plan, then the
 * tenant moves, then apply answers 409 plan_stale" and check what the client
 * sent. Not shipped: tsup only bundles the entry points.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { CompanyConfigApplyResult, CompanyConfigChange, CompanyConfigPlan } from "../types.js";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export type Reply = { status: number; body?: unknown };
export type Handler = (req: RecordedRequest, nth: number) => Reply;

export interface FakeConfigServer {
  url: string;
  requests: RecordedRequest[];
  /** Route by "METHOD /path" (path without query). Unrouted requests answer 404. */
  on(route: string, handler: Handler | Reply | Reply[]): void;
  close(): Promise<void>;
}

export async function startFakeConfigServer(): Promise<FakeConfigServer> {
  const requests: RecordedRequest[] = [];
  const routes = new Map<string, Handler>();
  const counts = new Map<string, number>();

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = (req.url ?? "/").split("?")[0]!;
      const rec: RecordedRequest = {
        method: req.method ?? "GET",
        path,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined,
      };
      requests.push(rec);
      const key = `${rec.method} ${path}`;
      const nth = counts.get(key) ?? 0;
      counts.set(key, nth + 1);
      const handler = routes.get(key);
      const reply = handler
        ? handler(rec, nth)
        : { status: 404, body: { message: "not found", error_code: "not_found", tracer_id: "t" } };
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(reply.body === undefined ? "" : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    on(route, handler) {
      if (typeof handler === "function") routes.set(route, handler);
      else if (Array.isArray(handler)) routes.set(route, (_r, n) => handler[Math.min(n, handler.length - 1)]!);
      else routes.set(route, () => handler);
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/** A plan with sensible defaults; override what the test is about. */
export function fakePlan(over: Partial<CompanyConfigPlan> = {}): CompanyConfigPlan {
  const changes: CompanyConfigChange[] = over.changes ?? [
    { action: "create", resource: "product", ref: "AI Chat", key: "ai-chat", sentence: "Create the product AI Chat." },
  ];
  return {
    docHash: "doc_1",
    stateHash: "state_1",
    planHash: "plan_1",
    baseRevision: null,
    mode: "sandbox",
    options: {},
    hasChanges: changes.some((c) => c.action !== "skip"),
    blocked: changes.some((c) => c.action === "blocked"),
    orphaned: [],
    unmanaged: [],
    drift: [],
    ...over,
    changes,
  };
}

export function fakeApply(status: "applied" | "planned", over: Partial<CompanyConfigApplyResult> = {}): CompanyConfigApplyResult {
  return {
    revision: {
      id: "crev_1",
      number: 1,
      status,
      mode: status === "planned" ? "live" : "sandbox",
      docHash: "doc_1",
      planHash: "plan_1",
      author: { kind: "api_key", id: "key_1" },
      createdAt: "2026-10-16T00:00:00Z",
    },
    ...(status === "planned" ? { approvalUrl: "https://app.beinfi.com/config/revisions/crev_1" } : {}),
    ...over,
  };
}

export function apiError(status: number, code: string, metadata?: Record<string, string>): Reply {
  return { status, body: { message: code, error_code: code, tracer_id: "trc_1", ...(metadata ? { metadata } : {}) } };
}
