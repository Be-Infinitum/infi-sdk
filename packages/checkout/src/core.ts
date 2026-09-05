import {
  PROTOCOL,
  isEmbedFrame,
  type CheckoutState,
  type CompletePayload,
  type EmbedErrorCode,
  type EmbedRequestMethod,
  type EmbedToParent,
  type PaymentMethod,
  type ParentToEmbed,
} from "./protocol.js";
import { resolveAppBase, type CheckoutMode } from "./hosts.js";
import { buildEmbedUrl, type EmbedSource, type EmbedUrlOptions } from "./url.js";

export interface CheckoutEmbedCallbacks {
  /** `loading` → `ready` → `disabled` while a charge is in flight. */
  onStateChange?: (state: CheckoutState, method: PaymentMethod | null) => void;
  /**
   * The payer finished. **This is not proof of payment** — it is a client-side
   * event on a page you control. Fulfil on the `payment.confirmed` /
   * `checkout.session.completed` webhook; use this to change the screen.
   */
  onComplete?: (payload: CompletePayload) => void;
  /** A charge exists and is waiting on the payer — a pix code, a card challenge. */
  onPaymentPending?: (info: {
    method: PaymentMethod;
    paymentId: string;
    /** The server's deadline, or null when it gave none. Never invented here. */
    expiresAt: string | null;
  }) => void;
  onPaymentError?: (error: { message: string; code: EmbedErrorCode }) => void;
}

export interface CreateCheckoutEmbedOptions
  extends Omit<EmbedUrlOptions, "embedId" | "parentOrigin">,
    CheckoutEmbedCallbacks {
  readonly mode: CheckoutMode;
  /**
   * Where to send the buyer once the checkout finishes. The embed navigates the
   * TOP window (not itself), and appends `?status=success` or `?status=error`,
   * so post-payment code can branch on it the way it would after any redirect.
   *
   * Omit to keep the buyer on your page and handle `onComplete` yourself.
   */
  readonly returnUrl?: string;
  /**
   * Stay on the page even though `returnUrl` is set. Use it when you want the
   * URL recorded for a fallback but intend to react in `onComplete`.
   */
  readonly skipRedirect?: boolean;
  /** Give up if the iframe has not said `ready` within this many ms. Default 15000. */
  readonly handshakeTimeoutMs?: number;
  /** Called with the content height so a host can size its own container. */
  readonly onResize?: (height: number) => void;
}

export interface CheckoutEmbedHandle {
  readonly iframe: HTMLIFrameElement;
  readonly embedId: string;
  submit(): Promise<void>;
  getEmail(): Promise<string>;
  setEmail(email: string): Promise<void>;
  getTaxId(): Promise<string>;
  setTaxId(taxId: string): Promise<void>;
  /** Remove the listener and the iframe. Safe to call twice. */
  destroy(): void;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Append the outcome to a return URL without disturbing what is already there.
 *
 * Built with `URL` rather than string concatenation because a merchant's return
 * URL routinely already carries query params (an order id, a UTM tag), and
 * `?status=` glued onto `...?order=1` produces a URL with two `?` that no
 * router parses. An existing `status` is overwritten — ours is the authoritative
 * one for this navigation.
 *
 * A relative URL is resolved against the current page, which is what a merchant
 * passing `/obrigado` means.
 */
function withStatus(
  returnUrl: string,
  status: "success" | "error",
  extra: Record<string, string | null | undefined> = {},
): string {
  try {
    const url = new URL(returnUrl, globalThis.location?.href);
    url.searchParams.set("status", status);
    for (const [key, value] of Object.entries(extra)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    // An unparseable returnUrl is the merchant's typo, and swallowing it here
    // would strand the buyer on a finished checkout with no way forward. Send
    // them to it verbatim and let the browser report what is wrong.
    return returnUrl;
  }
}

/**
 * Error codes after which the payer cannot continue in this embed: the pix code
 * expired, the link session expired, the invoice closed, the link is gone.
 * These — and only these — send the buyer to `returnUrl` with `?status=error`.
 */
const TERMINAL_ERRORS: ReadonlySet<EmbedErrorCode> = new Set<EmbedErrorCode>([
  "payment_expired",
  "session_expired",
  "invoice_not_open",
  "unavailable",
]);

function randomId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `inf_emb_${hex}`;
}

/**
 * Mount the Infi checkout into `target` and return a handle.
 *
 * Framework-agnostic on purpose: the React binding is a thin wrapper over this,
 * and the plain-`<script>` loader will be another one.
 */
export function createCheckoutEmbed(
  target: HTMLElement,
  source: EmbedSource,
  options: CreateCheckoutEmbedOptions,
): CheckoutEmbedHandle {
  const embedId = randomId();
  const expectedOrigin = resolveAppBase(options.mode, options.appUrl);
  const parentOrigin = globalThis.location?.origin ?? "";

  const src = buildEmbedUrl(source, { ...options, embedId, parentOrigin });

  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = "Checkout";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  // `payment` for the Payment Request API (Apple/Google Pay inside the PSP's own
  // frame), `clipboard-write` because copying the pix code IS the pix flow, and
  // `publickey-credentials-get` for a 3DS challenge that uses WebAuthn.
  iframe.setAttribute(
    "allow",
    `payment ${expectedOrigin}; clipboard-write ${expectedOrigin}; publickey-credentials-get ${expectedOrigin}`,
  );

  let ready = false;
  let destroyed = false;
  const queue: ParentToEmbed[] = [];
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  const handshakeTimer = setTimeout(() => {
    if (ready || destroyed) return;
    options.onPaymentError?.({
      message:
        "The checkout did not load. Check the link token and that the page is reachable.",
      code: "handshake_timeout",
    });
  }, options.handshakeTimeoutMs ?? 15_000);

  function post(message: ParentToEmbed): void {
    if (!ready) {
      queue.push(message);
      return;
    }
    // Never "*": a targeted origin is what stops a hijacked frame from reading
    // what we send it.
    iframe.contentWindow?.postMessage(message, expectedOrigin);
  }

  function request(method: EmbedRequestMethod, arg?: string): Promise<unknown> {
    if (destroyed) return Promise.reject(new Error("The checkout embed was destroyed."));
    const requestId = randomId();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`The checkout did not answer "${method}" in time.`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      post({ __infi: PROTOCOL, embedId, type: "request", requestId, method, arg });
    });
  }

  function onMessage(event: MessageEvent): void {
    // Order matters and all three are required. `source` proves it came from
    // our frame; `origin` proves that frame is still on our host; the envelope
    // proves it is ours and for THIS embed. A page can forge `data` freely.
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== expectedOrigin) return;
    if (!isEmbedFrame(event.data, embedId)) return;

    const frame = event.data as EmbedToParent;

    switch (frame.type) {
      case "ready": {
        ready = true;
        clearTimeout(handshakeTimer);
        for (const queued of queue.splice(0)) {
          iframe.contentWindow?.postMessage(queued, expectedOrigin);
        }
        break;
      }
      case "resize": {
        iframe.style.height = `${frame.height}px`;
        options.onResize?.(frame.height);
        break;
      }
      case "state": {
        options.onStateChange?.(frame.state, frame.method);
        break;
      }
      case "payment_pending": {
        options.onPaymentPending?.({
          method: frame.method,
          paymentId: frame.paymentId,
          expiresAt: frame.expiresAt,
        });
        break;
      }
      case "complete": {
        options.onComplete?.(frame.payload);
        if (options.returnUrl && !options.skipRedirect) {
          navigateTop(
            withStatus(options.returnUrl, "success", { invoice: frame.payload.invoiceId }),
          );
        }
        break;
      }
      case "error": {
        options.onPaymentError?.({ message: frame.message, code: frame.code });
        // Only when the checkout is over for this payer. A declined card or a
        // missing CPF is retried inline; sending the buyer away on those would
        // turn every typo into an abandoned purchase.
        if (options.returnUrl && !options.skipRedirect && TERMINAL_ERRORS.has(frame.code)) {
          navigateTop(withStatus(options.returnUrl, "error", { code: frame.code }));
        }
        break;
      }
      case "navigate": {
        navigateTop(frame.url);
        break;
      }
      case "reply": {
        const entry = pending.get(frame.requestId);
        if (!entry) break;
        pending.delete(frame.requestId);
        clearTimeout(entry.timer);
        if (frame.ok) entry.resolve(frame.value);
        else entry.reject(new Error(frame.error ?? "The checkout refused the request."));
        break;
      }
    }
  }

  /** The frame cannot navigate the top window itself across origins; we can. */
  function navigateTop(url: string): void {
    globalThis.location.assign(url);
  }

  globalThis.addEventListener("message", onMessage);
  target.appendChild(iframe);

  return {
    iframe,
    embedId,
    async submit() {
      await request("submit");
    },
    async getEmail() {
      return String((await request("getEmail")) ?? "");
    },
    async setEmail(email: string) {
      await request("setEmail", email);
    },
    async getTaxId() {
      return String((await request("getTaxId")) ?? "");
    },
    async setTaxId(taxId: string) {
      await request("setTaxId", taxId);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(handshakeTimer);
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("The checkout embed was destroyed."));
      }
      pending.clear();
      globalThis.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}
