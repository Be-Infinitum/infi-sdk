import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfiProvider, LoginElement, SignedIn, SignedOut, useInfiAuth } from "./index.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const signedIn = {
  buyer: { email: "ana@x.test", customerIds: ["c1"], externalIds: ["ana@x.test"] },
  origin: "code",
  expiresAt: "2026-10-28T00:00:00Z",
  access: [{ productId: "p1", key: "ecommerce/ebook", name: "Ebook", kind: "purchase" }],
};

function Who() {
  const auth = useInfiAuth();
  return (
    <p>
      {auth.status}:{auth.buyer?.buyer.email ?? "-"}:{String(auth.has("ecommerce/ebook"))}
    </p>
  );
}

describe("store login", () => {
  it("LoginElement mounts the login frame of the store, never the portal", () => {
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox">
        <LoginElement />
      </InfiProvider>,
    );
    const src = new URL(container.querySelector("iframe")!.src);
    expect(src.pathname).toBe("/embed/sandbox/loja/login");
  });

  it("the frame's token goes to the site's route, never kept, and every hook refreshes", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    let session: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (init?.method === "POST") session = signedIn;
        return new Response(JSON.stringify({ buyer: session }), { status: 200 });
      }),
    );
    const onSignedIn = vi.fn();
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox">
        <Who />
        <SignedOut>
          <LoginElement onSignedIn={onSignedIn} />
        </SignedOut>
        <SignedIn>
          <span>área</span>
        </SignedIn>
      </InfiProvider>,
    );
    await waitFor(() => expect(screen.getByText("signed_out:-:false")).toBeTruthy());

    const iframe = container.querySelector("iframe")!;
    const embedId = new URL(iframe.src).searchParams.get("embedId");
    await act(async () => {
      globalThis.dispatchEvent(
        new MessageEvent("message", {
          source: iframe.contentWindow,
          origin: "https://app-sandbox.beinfi.com",
          data: { __infi: "portal/v1", embedId, type: "token", token: "bt_x", expiresAt: "x" },
        }),
      );
    });

    await waitFor(() => expect(screen.getByText("signed_in:ana@x.test:true")).toBeTruthy());
    expect(screen.getByText("área")).toBeTruthy();
    expect(onSignedIn).toHaveBeenCalledWith(signedIn);
    const post = calls.find(([, i]) => i?.method === "POST")!;
    expect(post[0]).toBe("/api/infi/auth");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ token: "bt_x" });
  });
});
