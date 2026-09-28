import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { CheckoutElement, InfiProvider, PortalElement, StoreElement } from "./index.js";

afterEach(() => cleanup());

const store = {
  slug: "loja",
  name: "Loja",
  items: [
    { productId: "p1", name: "Ebook", price: "49.90", currency: "BRL", requiresShipping: false, availableOnsite: false },
    { productId: "p2", name: "Clube", price: "29.90", currency: "BRL", billingCycle: "monthly", requiresShipping: false, availableOnsite: false },
  ],
};

describe("elements", () => {
  it("refuse to render outside the provider", () => {
    expect(() => render(<PortalElement />)).toThrow(/InfiProvider/);
  });

  it("CheckoutElement takes slug, environment and look from the provider", () => {
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox" appearance={{ accentColor: "#ff0066" }}>
        <CheckoutElement linkToken="plink_abc" />
      </InfiProvider>,
    );
    const src = new URL(container.querySelector("iframe")!.src);
    expect(src.origin).toBe("https://app-sandbox.beinfi.com");
    expect(src.pathname).toContain("/loja/links/plink_abc");
    expect(src.searchParams.get("accent")).toBe("#ff0066");
  });

  it("PortalElement mounts the portal frame of the store, live on production, with no token in the URL", () => {
    const { container } = render(
      <InfiProvider slug="loja" environment="production">
        <PortalElement token="bt_secret" />
      </InfiProvider>,
    );
    const src = container.querySelector("iframe")!.src;
    expect(src.startsWith("https://app.beinfi.com/embed/loja/portal?")).toBe(true);
    expect(src).not.toContain("bt_");
  });

  it("StoreElement shows the server's prices and links each product", () => {
    render(<StoreElement store={store} href={(i) => `/produto/${i.productId}`} />);
    expect(screen.getByText("Ebook")).toBeTruthy();
    expect(screen.getByText("Comprar").getAttribute("href")).toBe("/produto/p1");
    expect(screen.getByText("Assinar").getAttribute("href")).toBe("/produto/p2");
    expect(document.body.textContent).toContain("R$");
  });
});
