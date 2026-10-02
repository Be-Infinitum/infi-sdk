import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignals, type SignalsClient } from "./signals.js";

type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

let sent: Sent[];
let client: SignalsClient | null;

function fakeFetch(status = 202) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(JSON.stringify({ id: "f1", accepted: 1 }), { status });
  });
}

function start(extra: Partial<Parameters<typeof createSignals>[0]> = {}) {
  client = createSignals({
    publishableKey: "pk_test_x",
    environment: "sandbox",
    apiUrl: "https://api.test",
    fetch: fakeFetch() as unknown as typeof fetch,
    flushInterval: 60_000,
    ...extra,
  });
  return client;
}

// Node 25 defines its own localStorage on the global, which shadows the DOM's
// in happy-dom; a Map-backed Storage stands in for the browser's.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  sent = [];
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: memoryStorage(), configurable: true });
  history.replaceState(null, "", "/clube?email=ana@x.com");
});

afterEach(() => {
  client?.destroy();
  client = null;
  document.body.innerHTML = "";
});

const events = () => sent.filter((s) => s.url.endsWith("/events")).flatMap((s) => s.body.events as Array<Record<string, unknown>>);

describe("signals", () => {
  it("sends the page view with the key and without the query string", async () => {
    const c = start();
    await c.flush();
    expect(sent[0]!.url).toBe("https://api.test/public/signals/events");
    expect(sent[0]!.headers.Authorization).toBe("Bearer pk_test_x");
    expect(events()[0]!).toMatchObject({ kind: "page", name: "view", path: "/clube" });
    expect(JSON.stringify(sent[0]!.body)).not.toContain("ana@x.com");
    expect(sent[0]!.body.visitorId).toBeTruthy();
    expect(sent[0]!.body.sessionId).toBeTruthy();
  });

  it("keeps the same visitor across clients and counts a new page on pushState", async () => {
    const c = start();
    await c.flush();
    const first = sent[0]!.body.visitorId;
    history.pushState(null, "", "/checkout");
    await c.flush();
    expect(events().map((e) => e.path)).toEqual(["/clube", "/checkout"]);
    c.destroy();
    const again = start();
    again.track("x");
    await again.flush();
    expect(sent.at(-1)!.body.visitorId).toBe(first);
  });

  it("sends nothing before consent, and starts when it is given", async () => {
    const c = start({ consent: false });
    c.track("ignored");
    await c.flush();
    expect(sent).toHaveLength(0);
    c.setConsent(true);
    await c.flush();
    expect(events().map((e) => e.kind)).toEqual(["page"]);
  });

  it("tracks named CTAs and nothing else that is clicked", async () => {
    document.body.innerHTML = `<button data-infi-cta="assinar"><span id="inner">Assinar</span></button><button id="other">x</button>`;
    const c = start();
    document.getElementById("inner")!.click();
    document.getElementById("other")!.click();
    await c.flush();
    expect(events().filter((e) => e.kind === "click")).toEqual([
      expect.objectContaining({ name: "cta", properties: { cta: "assinar" } }),
    ]);
  });

  it("reports the page's failed requests but not its own", async () => {
    const pageFetch = vi.fn(async () => new Response("", { status: 503 }));
    window.fetch = pageFetch as unknown as typeof fetch;
    const c = start();
    await window.fetch("/api/price?token=secret");
    await c.flush();
    const failed = events().filter((e) => e.kind === "network_error");
    expect(failed).toEqual([expect.objectContaining({ name: "GET /api/price 503", value: 503 })]);
  });

  it("ties what follows to the customer once identified", async () => {
    const c = start();
    c.identify("cliente-42");
    c.checkout("started");
    await c.flush();
    expect(sent[0]!.body.externalId).toBe("cliente-42");
    expect(events().at(-1)).toMatchObject({ kind: "checkout", name: "started" });
  });

  it("sends feedback with who and where", async () => {
    const c = start();
    await expect(c.feedback({ reaction: "love", message: "ótimo" })).resolves.toEqual({ id: "f1", accepted: 1 });
    const fb = sent.find((s) => s.url.endsWith("/feedback"))!;
    expect(fb.body).toMatchObject({ reaction: "love", message: "ótimo", path: "/clube" });
    expect(fb.body.visitorId).toBeTruthy();
  });
});
