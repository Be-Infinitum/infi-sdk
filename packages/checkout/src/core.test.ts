import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutEmbed } from "./core.js";
import { PROTOCOL } from "./protocol.js";

const ORIGIN = "https://app-sandbox.beinfi.com";
const opts = { mode: "sandbox" as const };

function mount(extra: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const handle = createCheckoutEmbed(host, { slug: "acme", linkToken: "plink_1" }, { ...opts, ...extra });
  return { host, handle };
}

/** happy-dom gives every window the page's own origin, so a real cross-origin
 *  message cannot be produced. Fake the event instead and assert the guards. */
// `frame` is deliberately untyped: these tests deliver hostile and malformed
// payloads, which is exactly what a real page can post at us.
function deliver(frame: Record<string, unknown>, over: Partial<MessageEvent> = {}) {
  const iframe = document.querySelector("iframe");
  const event = {
    source: iframe?.contentWindow ?? null,
    origin: ORIGIN,
    data: frame,
    ...over,
  } as unknown as MessageEvent;
  window.dispatchEvent(Object.assign(new Event("message"), event));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("createCheckoutEmbed", () => {
  it("mounts one iframe pointed at the resolved host", () => {
    const { host, handle } = mount();
    const iframe = host.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain(`${ORIGIN}/embed/sandbox/acme/links/plink_1`);
    handle.destroy();
  });

  it("delegates clipboard-write — copying the pix code is the pix flow", () => {
    const { host, handle } = mount();
    // Without this the clipboard write rejects in a cross-origin frame and the
    // buyer is told the code was copied when it was not.
    expect(host.querySelector("iframe")?.getAttribute("allow")).toContain("clipboard-write");
    handle.destroy();
  });

  it("ignores a message from the wrong origin", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    deliver(
      { __infi: PROTOCOL, embedId: handle.embedId, type: "complete", payload: { sessionId: null, invoiceId: "x", paymentId: null, method: "pix" } },
      { origin: "https://evil.example" },
    );
    expect(onComplete).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("ignores a message whose source is not our frame", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    deliver(
      { __infi: PROTOCOL, embedId: handle.embedId, type: "complete", payload: { sessionId: null, invoiceId: "x", paymentId: null, method: "pix" } },
      { source: window },
    );
    expect(onComplete).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("ignores another library's postMessage traffic", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    deliver({ __infi: "someone-else/v1", embedId: handle.embedId, type: "complete" });
    expect(onComplete).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("ignores a frame addressed to a different embed on the same page", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    deliver({ __infi: PROTOCOL, embedId: "inf_emb_other", type: "complete", payload: {} });
    expect(onComplete).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("reports completion once the frame is trusted", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    const payload = { sessionId: "s1", invoiceId: "inv_1", paymentId: "pay_1", method: "pix" };
    deliver({ __infi: PROTOCOL, embedId: handle.embedId, type: "complete", payload });
    expect(onComplete).toHaveBeenCalledWith(payload);
    handle.destroy();
  });

  it("surfaces the server's pix deadline and never invents one", () => {
    const onPaymentPending = vi.fn();
    const { handle } = mount({ onPaymentPending });
    deliver({ __infi: PROTOCOL, embedId: handle.embedId, type: "payment_pending", method: "pix", paymentId: "p1", expiresAt: null });
    expect(onPaymentPending).toHaveBeenCalledWith({ method: "pix", paymentId: "p1", expiresAt: null });
    handle.destroy();
  });

  it("sizes the frame from the child's measured height", () => {
    const { host, handle } = mount();
    deliver({ __infi: PROTOCOL, embedId: handle.embedId, type: "resize", height: 812 });
    expect(host.querySelector("iframe")?.style.height).toBe("812px");
    handle.destroy();
  });

  it("stops listening after destroy", () => {
    const onComplete = vi.fn();
    const { handle } = mount({ onComplete });
    const embedId = handle.embedId;
    handle.destroy();
    deliver({ __infi: PROTOCOL, embedId, type: "complete", payload: {} });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("removes the iframe on destroy, and destroy is idempotent", () => {
    const { host, handle } = mount();
    handle.destroy();
    handle.destroy();
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("rejects in-flight requests when destroyed rather than hanging", async () => {
    const { handle } = mount();
    const pending = handle.getEmail();
    handle.destroy();
    await expect(pending).rejects.toThrow(/destroyed/);
  });
});

describe("returnUrl", () => {
  let restoreAssign: (() => void) | undefined;
  afterEach(() => {
    restoreAssign?.();
    restoreAssign = undefined;
  });

  function completeWith(extra: Record<string, unknown>) {
    // Mount first, THEN stub `assign`. happy-dom reads `location` while
    // inserting the iframe, and a stub in place during that walk makes it noisy.
    // Only `assign` is replaced — swapping the whole `location` object breaks
    // happy-dom's DOM internals outright.
    const { handle } = mount(extra);
    const original = globalThis.location.assign;
    const assign = vi.fn();
    Object.defineProperty(globalThis.location, "assign", {
      configurable: true,
      writable: true,
      value: assign,
    });
    restoreAssign = () => {
      Object.defineProperty(globalThis.location, "assign", {
        configurable: true,
        writable: true,
        value: original,
      });
    };
    deliver({
      __infi: PROTOCOL,
      embedId: handle.embedId,
      type: "complete",
      payload: { sessionId: null, invoiceId: "inv_1", paymentId: "pay_1", method: "pix" },
    });
    return { assign, handle };
  }

  it("navigates the top window with the outcome and the invoice appended", () => {
    const { assign, handle } = completeWith({ returnUrl: "https://shop.acme.com/obrigado" });
    expect(assign).toHaveBeenCalledWith(
      "https://shop.acme.com/obrigado?status=success&invoice=inv_1",
    );
    handle.destroy();
  });

  it("keeps the merchant's own query params instead of colliding with them", () => {
    // `?status=` concatenated onto an existing query makes a URL with two `?`
    // that no router parses.
    const { assign, handle } = completeWith({
      returnUrl: "https://shop.acme.com/obrigado?order=42&utm_source=x",
    });
    const url = new URL(assign.mock.calls[0]![0] as string);
    expect(url.searchParams.get("order")).toBe("42");
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.searchParams.get("status")).toBe("success");
    handle.destroy();
  });

  it("resolves a relative returnUrl against the page", () => {
    const { assign, handle } = completeWith({ returnUrl: "/obrigado" });
    const url = new URL(assign.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/obrigado");
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.searchParams.get("status")).toBe("success");
    handle.destroy();
  });

  it("stays put when skipRedirect is set, but still reports completion", () => {
    const onComplete = vi.fn();
    const { assign, handle } = completeWith({
      returnUrl: "https://shop.acme.com/obrigado",
      skipRedirect: true,
      onComplete,
    });
    expect(assign).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    handle.destroy();
  });

  it("does not navigate at all without a returnUrl", () => {
    const { assign, handle } = completeWith({});
    expect(assign).not.toHaveBeenCalled();
    handle.destroy();
  });

  function errorWith(code: string, extra: Record<string, unknown>) {
    const { handle } = mount(extra);
    const original = globalThis.location.assign;
    const assign = vi.fn();
    Object.defineProperty(globalThis.location, "assign", {
      configurable: true,
      writable: true,
      value: assign,
    });
    restoreAssign = () => {
      Object.defineProperty(globalThis.location, "assign", {
        configurable: true,
        writable: true,
        value: original,
      });
    };
    deliver({ __infi: PROTOCOL, embedId: handle.embedId, type: "error", message: "x", code });
    return { assign, handle };
  }

  // The pix code expired with nothing paid: the buyer cannot continue here, so
  // the merchant's page gets them back with the outcome named.
  it("sends the buyer to returnUrl with status=error when the checkout is over", () => {
    const onPaymentError = vi.fn();
    const { assign, handle } = errorWith("payment_expired", {
      returnUrl: "https://shop.acme.com/obrigado?order=42",
      onPaymentError,
    });
    const url = new URL(assign.mock.calls[0]![0] as string);
    expect(url.searchParams.get("order")).toBe("42");
    expect(url.searchParams.get("status")).toBe("error");
    expect(url.searchParams.get("code")).toBe("payment_expired");
    expect(onPaymentError).toHaveBeenCalledWith({ message: "x", code: "payment_expired" });
    handle.destroy();
  });

  // A declined card or a missing CPF is retried inline. Redirecting there would
  // turn every typo into an abandoned purchase.
  it("stays put on a retryable error even with a returnUrl", () => {
    for (const code of ["customer_tax_id_required", "charge_in_progress", "unknown"]) {
      const { assign, handle } = errorWith(code, { returnUrl: "https://shop.acme.com/obrigado" });
      expect(assign).not.toHaveBeenCalled();
      handle.destroy();
      restoreAssign?.();
    }
  });

  it("stays put on a terminal error when skipRedirect is set", () => {
    const { assign, handle } = errorWith("session_expired", {
      returnUrl: "https://shop.acme.com/obrigado",
      skipRedirect: true,
    });
    expect(assign).not.toHaveBeenCalled();
    handle.destroy();
  });
});
