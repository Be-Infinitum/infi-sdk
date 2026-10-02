/**
 * Signals: what visitors do on your site, and what they tell you (Infi
 * BE-437, BE-438). Pages, sections, scroll depth, CTA clicks, checkout steps,
 * JavaScript and network errors go to Infi with your publishable key, next to
 * the reasons your customers give when they cancel. Nothing is billed.
 *
 * Privacy, by construction: nothing is sent before `consent` is true; paths
 * go without their query string; form fields are never read; Infi drops what
 * looks personal on arrival as well. The visitor is an anonymous id kept in
 * localStorage, and your own customer id once you `identify()` them.
 */

import { apiBaseFor } from "./storefront.js";

export type SignalKind =
  | "page"
  | "section"
  | "scroll"
  | "click"
  | "error"
  | "network_error"
  | "custom"
  | "checkout";

export interface SignalEvent {
  kind: SignalKind;
  name: string;
  occurredAt?: string;
  path?: string;
  section?: string;
  value?: number;
  properties?: Record<string, string | number | boolean>;
}

export interface SignalsOptions {
  /** Your publishable key (`pk_live_…` / `pk_test_…`). Never the `sk_`. */
  publishableKey: string;
  environment: "sandbox" | "production";
  /** Override the Infi API host (local backend). */
  apiUrl?: string;
  /**
   * Whether the visitor agreed. Default true; pass false when your consent
   * banner has not been answered yet, and call `setConsent(true)` when it is.
   * While false nothing is collected and nothing is sent.
   */
  consent?: boolean;
  /** Your customer's id, when the visitor is signed in. */
  externalId?: string;
  /** Turn single automatic captures off. All on by default. */
  capture?: Partial<Record<"pages" | "sections" | "scroll" | "clicks" | "errors" | "network", boolean>>;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** How often the queue is flushed, ms. */
  flushInterval?: number;
}

export interface FeedbackInput {
  rating?: number;
  reaction?: "love" | "like" | "neutral" | "dislike";
  message?: string;
}

export interface SignalsClient {
  /** One of your own events: `track("plan_compared", { plan: "pro" })`. */
  track(name: string, properties?: SignalEvent["properties"]): void;
  /** A step of the checkout funnel: started, completed. */
  checkout(step: "started" | "completed", properties?: SignalEvent["properties"]): void;
  /** Ties what follows to your customer id (sign-in); undefined forgets it (sign-out). */
  identify(externalId: string | undefined): void;
  setConsent(granted: boolean): void;
  /** Sends what is queued now. Resolves when it is on its way. */
  flush(): Promise<void>;
  feedback(input: FeedbackInput): Promise<{ id: string }>;
  destroy(): void;
}

const VISITOR_KEY = "infi_visitor";
const SESSION_KEY = "infi_session";
// A visit ends after half an hour without a signal, as most analytics tools count it.
const SESSION_IDLE_MS = 30 * 60 * 1000;
const MAX_BATCH = 50;
const SCROLL_STEPS = [25, 50, 75, 100];

function randomId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function store(kind: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return (kind === "local" ? window.localStorage : window.sessionStorage) ?? null;
  } catch {
    return null; // blocked storage: the visit is anonymous and one page long
  }
}

function visitorId(): string {
  const s = store("local");
  let id = s?.getItem(VISITOR_KEY) ?? "";
  if (!id) {
    id = randomId();
    s?.setItem(VISITOR_KEY, id);
  }
  return id;
}

function sessionId(now: number): string {
  const s = store("session");
  const raw = s?.getItem(SESSION_KEY);
  if (raw) {
    const [id, last] = raw.split("|");
    if (id && Number(last) > now - SESSION_IDLE_MS) {
      s?.setItem(SESSION_KEY, `${id}|${now}`);
      return id;
    }
  }
  const id = randomId();
  s?.setItem(SESSION_KEY, `${id}|${now}`);
  return id;
}

function currentPath(): string {
  return typeof location === "undefined" ? "" : location.pathname;
}

export function createSignals(options: SignalsOptions): SignalsClient {
  // Taken before startNetwork wraps window.fetch, so our own requests are
  // never reported as the page's.
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = apiBaseFor(options.environment === "production" ? "live" : "sandbox", options.apiUrl);
  const capture = { pages: true, sections: true, scroll: true, clicks: true, errors: true, network: true, ...options.capture };
  let consent = options.consent ?? true;
  let externalId = options.externalId;
  let queue: SignalEvent[] = [];
  const cleanups: Array<() => void> = [];
  let started = false;

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.publishableKey}`,
  });
  const who = () => ({ visitorId: visitorId(), sessionId: sessionId(Date.now()), externalId });

  const push = (event: SignalEvent) => {
    if (!consent) return;
    queue.push({ path: currentPath(), occurredAt: new Date().toISOString(), ...event });
    if (queue.length >= MAX_BATCH) void flush();
  };

  // keepalive lets the last batch leave with the page; sendBeacon cannot
  // carry the Authorization header.
  const flush = async () => {
    if (!queue.length || !consent) return;
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    try {
      await doFetch(`${base}/public/signals/events`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ...who(), events: batch }),
        keepalive: true,
      });
    } catch {
      // A signal lost to a network blip is not worth retrying into a loop.
    }
  };

  const start = () => {
    if (started || !consent || typeof window === "undefined") return;
    started = true;
    if (capture.pages) startPages(push, cleanups);
    if (capture.sections) startSections(push, cleanups);
    if (capture.scroll) startScroll(push, cleanups);
    if (capture.clicks) startClicks(push, cleanups);
    if (capture.errors) startErrors(push, cleanups);
    if (capture.network) startNetwork(push, cleanups, base);
    const timer = setInterval(() => void flush(), options.flushInterval ?? 5000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    cleanups.push(() => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    });
  };

  start();

  return {
    track: (name, properties) => push({ kind: "custom", name, properties }),
    checkout: (step, properties) => push({ kind: "checkout", name: step, properties }),
    identify: (id) => {
      externalId = id || undefined;
    },
    setConsent: (granted) => {
      consent = granted;
      if (granted) start();
      else queue = [];
    },
    flush,
    feedback: async (input) => {
      const res = await doFetch(`${base}/public/signals/feedback`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ...who(), ...input, path: currentPath() }),
      });
      if (!res.ok) throw new Error(`feedback: HTTP ${res.status}`);
      return (await res.json()) as { id: string };
    },
    destroy: () => {
      void flush();
      for (const fn of cleanups.splice(0)) fn();
      started = false;
    },
  };
}

type Push = (event: SignalEvent) => void;

function startPages(push: Push, cleanups: Array<() => void>) {
  let last = "";
  const view = () => {
    const path = currentPath();
    if (path === last) return;
    last = path;
    push({ kind: "page", name: "view" });
  };
  view();
  // Single-page apps change the path without a load: patch pushState and
  // replaceState, and listen to popstate, as every analytics snippet does.
  const { pushState, replaceState } = history;
  history.pushState = function (...args) {
    pushState.apply(this, args);
    view();
  };
  history.replaceState = function (...args) {
    replaceState.apply(this, args);
    view();
  };
  window.addEventListener("popstate", view);
  cleanups.push(() => {
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.removeEventListener("popstate", view);
  });
}

/** Sections you name: `<section data-infi-section="preços">`. */
function startSections(push: Push, cleanups: Array<() => void>) {
  if (typeof IntersectionObserver === "undefined") return;
  const since = new Map<Element, number>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const name = (entry.target as HTMLElement).dataset.infiSection ?? "";
        if (entry.isIntersecting) {
          since.set(entry.target, Date.now());
          push({ kind: "section", name: "view", section: name });
        } else if (since.has(entry.target)) {
          const ms = Date.now() - (since.get(entry.target) ?? Date.now());
          since.delete(entry.target);
          push({ kind: "section", name: "time", section: name, value: ms });
        }
      }
    },
    { threshold: 0.5 },
  );
  const observeAll = () => document.querySelectorAll("[data-infi-section]").forEach((el) => observer.observe(el));
  observeAll();
  const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(observeAll);
  mutations?.observe(document.body, { childList: true, subtree: true });
  cleanups.push(() => {
    observer.disconnect();
    mutations?.disconnect();
  });
}

function startScroll(push: Push, cleanups: Array<() => void>) {
  let reached = 0;
  let path = currentPath();
  const onScroll = () => {
    if (currentPath() !== path) {
      path = currentPath();
      reached = 0;
    }
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const pct = scrollable <= 0 ? 100 : Math.round(((window.scrollY || doc.scrollTop) / scrollable) * 100);
    for (const step of SCROLL_STEPS) {
      if (pct >= step && reached < step) {
        reached = step;
        push({ kind: "scroll", name: "depth", value: step });
      }
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener("scroll", onScroll));
}

/** CTAs you name: `<button data-infi-cta="assinar">`. Nothing else is clicked-tracked. */
function startClicks(push: Push, cleanups: Array<() => void>) {
  const onClick = (e: MouseEvent) => {
    const target = (e.target as Element | null)?.closest?.("[data-infi-cta]") as HTMLElement | null;
    if (!target) return;
    push({ kind: "click", name: "cta", properties: { cta: target.dataset.infiCta ?? "" } });
  };
  document.addEventListener("click", onClick, { capture: true });
  cleanups.push(() => document.removeEventListener("click", onClick, { capture: true }));
}

function startErrors(push: Push, cleanups: Array<() => void>) {
  const onError = (e: ErrorEvent) => push({ kind: "error", name: String(e.message || "Error").slice(0, 80) });
  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    push({ kind: "error", name: `Unhandled: ${reason}`.slice(0, 80) });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  cleanups.push(() => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  });
}

/** Failed requests your page makes: 5xx and network failures, path only. */
function startNetwork(push: Push, cleanups: Array<() => void>, ownBase: string) {
  const original = window.fetch;
  if (!original) return;
  const name = (method: string, url: string, status: string) => {
    let path = url;
    try {
      path = new URL(url, location.href).pathname;
    } catch {
      // keep what we got
    }
    return `${method.toUpperCase()} ${path} ${status}`.slice(0, 80);
  };
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const ours = url.startsWith(ownBase);
    try {
      const res = await original.call(window, input, init);
      if (!ours && res.status >= 500) push({ kind: "network_error", name: name(method, url, String(res.status)), value: res.status });
      return res;
    } catch (err) {
      if (!ours) push({ kind: "network_error", name: name(method, url, "failed") });
      throw err;
    }
  };
  cleanups.push(() => {
    window.fetch = original;
  });
}
