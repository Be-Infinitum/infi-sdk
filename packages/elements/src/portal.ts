/**
 * The buyer portal's calls (ADR 0006 in the backend): "Minhas compras" of one
 * store, authenticated by a `bt_` buyer token.
 *
 * Two ways to hold a token, one client:
 *  - (b) code session — `login(email)` mails a 6-digit code, `verify` spends it
 *    for a 30-day token. Every sensitive action needs a fresh code on top
 *    (`requestActionCode` → `confirmActionCode` → a single-use grant).
 *  - (c) the merchant's own login — pass `getToken`, which asks YOUR server
 *    for a 1-hour token minted with the sk_ (`infi.buyerTokens.create`). It is
 *    called when there is none and once more after a 401.
 *
 * The token lives in memory here. Never put it in localStorage or a URL.
 */

export type PortalScope = "portal:read" | "portal:write";

export interface PortalSession {
  origin: "code" | "merchant";
  scope: PortalScope;
  maskedEmail?: string;
  expiresAt: string;
  actionsNeedCode: boolean;
  actionsPermitted: boolean;
}

export interface PortalOrder {
  id: string;
  number?: string;
  status: string;
  currency: string;
  total: string;
  paidAt?: string;
  receiptUrl: string;
  lines: { description: string; quantity: string; amount: string }[];
  payment?: {
    id: string;
    method: string;
    status: string;
    amount: string;
    refundedAmount: string;
    refundPendingAmount: string;
  };
  guarantee: { days: number; endsAt: string; withinWindow: boolean };
  refundRequest?: PortalRefundRequest;
}

export interface PortalRefundRequest {
  id: string;
  status: "pending" | "approved" | "declined";
  withinWindow: boolean;
  decidedBy?: string;
  note?: string;
  createdAt: string;
}

export interface PortalDownload {
  id: string;
  productName: string;
  kind: "file" | "link";
  fileName?: string;
  orderId?: string;
  /** Absent when revoked. Relative to the API host (`/pay/{slug}/download/{token}`). */
  url?: string;
  revoked: boolean;
  revokedReason?: string;
  revokedAt?: string;
}

export interface PortalCard {
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

export interface PortalSubscription {
  id: string;
  productName: string;
  status: string;
  billingCycle: string;
  nextBillingDate?: string;
  cancelAtPeriodEnd: boolean;
  accessUntil?: string;
  canceledAt?: string;
  card?: PortalCard;
  canChangeCard: boolean;
}

export interface CardSetup {
  provider: "stripe";
  setupId: string;
  clientSecret: string;
  publishableKey: string;
}

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

export interface PortalClientOptions {
  /** The Infi API host, or your own same-origin proxy in front of it. */
  apiUrl: string;
  /** The store's slug (`/pay/{slug}`). */
  slug: string;
  /** A token you already hold (the site hands it back on every load). */
  token?: string;
  /** Path (c): mint a token on your server for your logged-in user. */
  getToken?: () => Promise<string | null>;
  /** Told whenever the token changes (to persist it first-party), or clears. */
  onToken?: (token: string | null) => void;
  fetchImpl?: typeof fetch;
}

type Req = { method?: "GET" | "POST"; body?: unknown; grant?: string; idempotencyKey?: string; auth?: boolean };

function newKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPortalClient(opts: PortalClientOptions) {
  const base = `${opts.apiUrl.replace(/\/$/, "")}/pay/${encodeURIComponent(opts.slug)}/portal`;
  const doFetch = opts.fetchImpl ?? fetch;
  let token = opts.token ?? null;
  // One getToken in flight: concurrent reads wait for the same one.
  let minting: Promise<string | null> | null = null;

  const setToken = (t: string | null) => {
    token = t;
    opts.onToken?.(t);
  };

  async function mint(): Promise<string | null> {
    if (!opts.getToken) return token;
    minting ??= opts.getToken().finally(() => {
      minting = null;
    });
    const t = await minting;
    setToken(t);
    return t;
  }

  async function call<T>(path: string, req: Req = {}, retried = false): Promise<T> {
    const auth = req.auth ?? true;
    if (auth && !token) await mint();
    const method = req.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (req.grant) headers["X-Buyer-Action-Grant"] = req.grant;
    // A write retried after a refresh carries the SAME key: if it already ran,
    // Infi answers with the stored response instead of running it twice.
    const idempotencyKey = method === "POST" ? (req.idempotencyKey ?? newKey()) : undefined;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    if (res.status === 401 && auth && !retried && opts.getToken) {
      setToken(null);
      await mint();
      if (token) return call<T>(path, { ...req, idempotencyKey }, true);
    }
    if (res.status === 401 && auth) setToken(null);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const nested = data.error as { code?: string; message?: string } | undefined;
      throw new PortalError(
        (data.message as string) ?? nested?.message ?? res.statusText,
        res.status,
        (data.error_code as string) ?? nested?.code ?? "request_failed",
      );
    }
    return data as T;
  }

  return {
    get token(): string | null {
      return token;
    },
    setToken,

    /** Same answer whether or not the address bought here; the code goes only to a buyer. */
    login: (email: string) =>
      call<{ challengeId: string; expiresAt: string }>("/login", { method: "POST", body: { email }, auth: false }),
    /** Spends the code; the 30-day token is kept in memory and passed to onToken. */
    async verify(challengeId: string, code: string) {
      const out = await call<{ token: string; expiresAt: string; origin: string; scope: PortalScope }>(
        "/login/verify",
        { method: "POST", body: { challengeId, code }, auth: false },
      );
      setToken(out.token);
      return out;
    },
    session: () => call<PortalSession>("/session"),
    orders: async () => (await call<{ orders: PortalOrder[] }>("/orders")).orders,
    downloads: async () => (await call<{ downloads: PortalDownload[] }>("/downloads")).downloads,
    subscriptions: async () => (await call<{ subscriptions: PortalSubscription[] }>("/subscriptions")).subscriptions,

    /** This device. */
    async signOut() {
      await call("/logout", { method: "POST", body: {} });
      setToken(null);
    },
    /** Every device of this person at this store. */
    async signOutEverywhere() {
      await call("/logout-all", { method: "POST", body: {} });
      setToken(null);
    },

    /** A fresh code for ONE sensitive action (code sessions only). */
    requestActionCode: () => call<{ challengeId: string; expiresAt: string }>("/action-codes", { method: "POST", body: {} }),
    /** The single-use grant the action carries. */
    confirmActionCode: async (challengeId: string, code: string) =>
      (await call<{ grant: string; expiresAt: string }>("/action-codes/verify", {
        method: "POST",
        body: { challengeId, code },
      })).grant,

    /** Cancel at the end of the paid period; undoable until then. */
    cancelSubscription: (id: string, grant?: string) =>
      call<PortalSubscription>(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {}, grant }),
    undoCancel: (id: string, grant?: string) =>
      call<PortalSubscription>(`/subscriptions/${encodeURIComponent(id)}/undo-cancel`, { method: "POST", body: {}, grant }),

    /** Opens a no-charge card setup (Stripe only). Confirm it in the Payment Element. */
    startCardSetup: (subscriptionId: string) =>
      call<CardSetup>(`/subscriptions/${encodeURIComponent(subscriptionId)}/card-setup`, { method: "POST", body: {} }),
    /** Keeps the confirmed card for the next renewals, with the mandate version shown. */
    completeCardSetup: (subscriptionId: string, input: { setupId: string; consentTextVersion: string; grant?: string }) =>
      call<PortalCard>(`/subscriptions/${encodeURIComponent(subscriptionId)}/card`, {
        method: "POST",
        body: { setupId: input.setupId, consentTextVersion: input.consentTextVersion },
        grant: input.grant,
      }),

    /** Inside the guarantee it is refunded automatically; after it, the store decides. */
    requestRefund: async (orderId: string, input: { reason?: string; grant?: string } = {}) =>
      (await call<{ refundRequest: PortalRefundRequest }>(`/orders/${encodeURIComponent(orderId)}/refund-request`, {
        method: "POST",
        body: { reason: input.reason },
        grant: input.grant,
      })).refundRequest,
  };
}

export type PortalClient = ReturnType<typeof createPortalClient>;
