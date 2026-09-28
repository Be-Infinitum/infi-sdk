import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfiProvider, LoginElement, PortalElement, SignedIn, SignedOut, useInfiAuth } from "./index.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

const signedIn = {
  buyer: { email: "ana@x.test", customerIds: ["c1"], externalIds: ["ana@x.test"] },
  origin: "oauth",
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

describe("Entrar com Infi", () => {
  it("LoginElement is a link to the site's own sign-in route, back to where it was, in the site's language", async () => {
    document.documentElement.lang = "en";
    window.history.replaceState({}, "", "/members?tab=1");
    render(<LoginElement />);
    const link = await screen.findByRole("link", { name: /Sign in with Infi/ });
    const href = new URL(link.getAttribute("href")!, "https://loja.test");
    expect(href.pathname).toBe("/api/infi/auth/sign-in");
    expect(href.searchParams.get("next")).toBe("/members?tab=1");
    expect(href.searchParams.get("locale")).toBe("en");
  });

  it("speaks Portuguese on a Portuguese site", async () => {
    document.documentElement.lang = "pt-BR";
    render(<LoginElement redirectTo="/purchases" />);
    const link = await screen.findByRole("link", { name: /Entrar com Infi/ });
    expect(new URL(link.getAttribute("href")!, "https://x.test").searchParams.get("next")).toBe("/purchases");
  });

  it("useInfiAuth and SignedIn/SignedOut read the site's session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ buyer: signedIn }), { status: 200 })));
    render(
      <>
        <Who />
        <SignedOut>
          <span>fora</span>
        </SignedOut>
        <SignedIn>
          <span>dentro</span>
        </SignedIn>
      </>,
    );
    await waitFor(() => expect(screen.getByText("signed_in:ana@x.test:true")).toBeTruthy());
    expect(screen.getByText("dentro")).toBeTruthy();
    expect(screen.queryByText("fora")).toBeNull();
  });

  it("a portal with nobody signed in sends the person to Entrar com Infi", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: window.location.origin, pathname: "/purchases", search: "", assign });
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox" locale="pt-BR">
        <PortalElement />
      </InfiProvider>,
    );
    const iframe = container.querySelector("iframe")!;
    const embedId = new URL(iframe.src).searchParams.get("embedId");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: "https://app-sandbox.beinfi.com",
        data: { __infi: "portal/v1", embedId, type: "sign_in" },
      }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const to = new URL(assign.mock.calls[0]![0], "https://x.test");
    expect(to.pathname).toBe("/api/infi/auth/sign-in");
    expect(to.searchParams.get("next")).toBe("/purchases");
  });
});
