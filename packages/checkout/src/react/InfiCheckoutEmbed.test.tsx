import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfiCheckoutEmbed } from "./InfiCheckoutEmbed.js";
import { PROTOCOL } from "../protocol.js";

// The embed talks to its iframe over postMessage, and the core validates all
// three of source, origin and envelope before it believes a frame. The iframe
// never loads here (see vitest.config), so the handshake is faked with the same
// shape a real frame sends — including the embedId the core put in the src,
// because a message without it is correctly ignored.
const ORIGIN = "https://app-sandbox.beinfi.com";

function announceState(state: "loading" | "ready" | "disabled") {
  const iframe = document.querySelector("iframe");
  const embedId = new URL(iframe!.src).searchParams.get("embedId");
  const event = {
    source: iframe!.contentWindow,
    origin: ORIGIN,
    data: { __infi: PROTOCOL, embedId, type: "state", state, method: null },
  } as unknown as MessageEvent;
  window.dispatchEvent(Object.assign(new Event("message"), event));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("fallback", () => {
  it("renders while the checkout is loading", () => {
    render(
      <InfiCheckoutEmbed
        slug="acme"
        linkToken="plink_1"
        environment="sandbox"
        fallback={<p>Carregando pagamento…</p>}
      />,
    );

    expect(screen.getByText("Carregando pagamento…")).toBeTruthy();
  });

  // The bug: `fallback` was rendered as a child of the very container the
  // iframe is appended to, and nothing ever removed it — so buyers saw
  // "Carregando pagamento…" sitting on top of a working checkout, forever. The
  // prop is documented as "rendered UNTIL the checkout has loaded".
  it("disappears once the checkout is ready", async () => {
    render(
      <InfiCheckoutEmbed
        slug="acme"
        linkToken="plink_1"
        environment="sandbox"
        fallback={<p>Carregando pagamento…</p>}
      />,
    );

    announceState("ready");

    await waitFor(() =>
      expect(screen.queryByText("Carregando pagamento…")).toBeNull(),
    );
  });

  // A checkout that comes back `disabled` (no payment method available) is not
  // loading either. Leaving the spinner up there would say "wait" about
  // something that is never going to arrive.
  it("disappears when the checkout comes back disabled", async () => {
    render(
      <InfiCheckoutEmbed
        slug="acme"
        linkToken="plink_1"
        environment="sandbox"
        fallback={<p>Carregando pagamento…</p>}
      />,
    );

    announceState("disabled");

    await waitFor(() =>
      expect(screen.queryByText("Carregando pagamento…")).toBeNull(),
    );
  });

  // The host element must stay out of React's hands: the iframe is appended to
  // it imperatively, and a React re-render of that subtree could drop it
  // mid-payment.
  it("keeps the iframe host free of React-managed children", () => {
    const { container } = render(
      <InfiCheckoutEmbed
        slug="acme"
        linkToken="plink_1"
        environment="sandbox"
        fallback={<p>Carregando pagamento…</p>}
      />,
    );

    const host = container.querySelector("[data-infi-checkout-frame]");
    expect(host).not.toBeNull();
    // Only the iframe the core appended, never the fallback.
    for (const child of Array.from(host!.children)) {
      expect(child.tagName).toBe("IFRAME");
    }
  });
});
