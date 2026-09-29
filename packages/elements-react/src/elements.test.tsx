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
    render(<StoreElement store={store} href={(i) => `/produto/${i.productId}`} locale="pt-BR" />);
    expect(screen.getByText("Ebook")).toBeTruthy();
    expect(screen.getByText("Comprar").getAttribute("href")).toBe("/produto/p1");
    expect(screen.getByText("Assinar").getAttribute("href")).toBe("/produto/p2");
    expect(document.body.textContent).toContain("R$");
  });
});

describe("languages", () => {
  afterEach(() => {
    document.documentElement.lang = "";
  });

  it("the store speaks the site's language, and a prop overrides it", async () => {
    document.documentElement.lang = "en";
    const { findByText, rerender } = render(
      <InfiProvider slug="loja" environment="sandbox">
        <StoreElement store={store} href={() => "#"} />
      </InfiProvider>,
    );
    expect(await findByText("Subscribe")).toBeTruthy();
    expect(await findByText("/month")).toBeTruthy();
    rerender(
      <InfiProvider slug="loja" environment="sandbox">
        <StoreElement store={store} href={() => "#"} locale="pt-BR" />
      </InfiProvider>,
    );
    expect(await findByText("Assinar")).toBeTruthy();
  });

  it("the provider's locale reaches every frame", () => {
    document.documentElement.lang = "en";
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox" locale="pt-BR">
        <PortalElement />
        <CheckoutElement linkToken="plink_abc" />
      </InfiProvider>,
    );
    for (const f of container.querySelectorAll("iframe")) {
      expect(new URL(f.src).searchParams.get("locale")).toBe("pt-BR");
    }
    expect(container.querySelectorAll("iframe")).toHaveLength(2);
  });

  it("with no locale anywhere, a frame follows <html lang>", () => {
    document.documentElement.lang = "en-US";
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox">
        <PortalElement />
      </InfiProvider>,
    );
    const f = container.querySelector("iframe")!;
    expect(new URL(f.src).searchParams.get("locale")).toBe("en");
    expect(f.title).toBe("My purchases");
  });
});
