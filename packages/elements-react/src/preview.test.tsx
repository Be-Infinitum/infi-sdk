import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckoutElement,
  CourseElement,
  EXAMPLE_BUYER,
  InfiProvider,
  PortalElement,
  ProductElement,
  StoreElement,
  effectiveAppearance,
  resolveAppearance,
  type ElementPreview,
} from "./index.js";

const preview: ElementPreview = {
  now: new Date("2026-09-28T12:00:00Z"),
  merchant: { name: "Loja da Ana" },
  appearance: effectiveAppearance(
    resolveAppearance({ business: { accentColor: "#0F766E", radius: "full" }, link: { font: "lora", backgroundColor: "#111111" } }),
  ),
  product: {
    id: "p1",
    name: "Guia de precificação",
    description: "Tudo sobre preço.",
    price: "97.00",
    currency: "BRL",
    purchaseButtonText: "Quero o guia",
    guaranteeDays: 14,
    media: [
      { type: "image", url: "https://cdn.test/capa.png", alt: "Capa" },
      { type: "video", url: "https://vimeo.com/1" },
    ],
    faq: [{ question: "Tem garantia?", answer: "Catorze dias." }],
  },
  course: {
    title: "Curso",
    modules: [{ title: "Fundamentos", lessons: [{ title: "Boas-vindas" }, { title: "Semana três", unlockAfterDays: 21 }] }],
  },
};

let fetchSpy: ReturnType<typeof vi.fn>;
let openSpy: ReturnType<typeof vi.fn>;
let xhrSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error("preview must not fetch")));
  openSpy = vi.fn();
  xhrSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("open", openSpy);
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      constructor() {
        xhrSpy();
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function expectNoNetwork(container: HTMLElement) {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(openSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  for (const a of container.querySelectorAll("a[href]")) {
    expect(a.getAttribute("href")).not.toMatch(/beinfi\.com/);
  }
}

// Inside a provider on purpose: a real slug and environment must not turn a
// preview into a live frame.
const inProvider = (el: ReactElement) =>
  render(
    <InfiProvider slug="loja" environment="production" locale="pt-BR">
      {el}
    </InfiProvider>,
  );

describe("preview mode never calls Infi", () => {
  it("CheckoutElement draws the draft natively: summary, coupon, pix QR, card look-alikes", () => {
    const { container } = inProvider(<CheckoutElement preview={preview} />);
    expect(screen.getByText("Guia de precificação")).toBeTruthy();
    expect(screen.getByText("Quero o guia")).toBeTruthy();
    expect(screen.getByText(/Garantia de 14 dias/)).toBeTruthy();
    expect(screen.getByLabelText("Cupom de desconto")).toBeTruthy();
    expect(container.querySelector("img")!.getAttribute("src")).toBe("https://cdn.test/capa.png");

    const qr = container.querySelector("svg[data-infi-preview-qr]")!;
    expect(qr.querySelectorAll("rect").length).toBeGreaterThan(50);
    expect((screen.getByLabelText("Copiar código") as HTMLInputElement).value).toMatch(/^PREVIA-/);

    fireEvent.click(screen.getByRole("tab", { name: "Cartão" }));
    const card = screen.getByRole("tabpanel");
    expect((within(card).getByLabelText("Número do cartão") as HTMLInputElement).disabled).toBe(true);
    expect(within(card).getByLabelText("CVC")).toBeTruthy();
    fireEvent.click(screen.getByText("Quero o guia"));

    expectNoNetwork(container);
  });

  it("CheckoutElement preview needs no provider and shows only the methods asked", () => {
    const { container } = render(<CheckoutElement preview={{ ...preview, methods: ["card"] }} locale="en" />);
    expect(screen.queryByRole("tab", { name: "Pix" })).toBeNull();
    expect(screen.getByLabelText("Card number")).toBeTruthy();
    expectNoNetwork(container);
  });

  it("StoreElement puts the draft on the shelf, honors storeVisible, and its buttons go nowhere", () => {
    const store = {
      slug: "loja",
      name: "Loja",
      items: [
        { productId: "p0", name: "Outro", price: "10.00", currency: "BRL", requiresShipping: false, availableOnsite: false, accentColor: "#DC2626" },
        { productId: "p1", name: "Versão publicada", price: "50.00", currency: "BRL", requiresShipping: false, availableOnsite: false },
      ],
    };
    const { container, rerender } = inProvider(<StoreElement preview={preview} store={store} />);
    expect(screen.getByText("Guia de precificação")).toBeTruthy();
    expect(screen.queryByText("Versão publicada")).toBeNull();
    expect(screen.getByText("Quero o guia").getAttribute("href")).toBeNull();
    const other = screen.getByText("Outro").closest("article")!;
    expect(other.style.getPropertyValue("--infi-accent")).toBe("#DC2626");

    rerender(
      <InfiProvider slug="loja" environment="production">
        <StoreElement preview={{ ...preview, product: { ...preview.product, storeVisible: false } }} store={store} />
      </InfiProvider>,
    );
    expect(screen.queryByText("Guia de precificação")).toBeNull();
    expectNoNetwork(container);
  });

  it("PortalElement shows the example buyer's purchase of the draft instead of the frame", () => {
    const { container } = inProvider(<PortalElement preview={preview} token="bt_ignored" />);
    expect(screen.getByText(new RegExp(EXAMPLE_BUYER.name))).toBeTruthy();
    expect(screen.getByText(new RegExp(EXAMPLE_BUYER.email))).toBeTruthy();
    expect(screen.getByText("Guia de precificação")).toBeTruthy();
    expect(screen.getByText(/Garantia até/)).toBeTruthy();
    expectNoNetwork(container);
  });

  it("CourseElement shows the draft course with sample progress, links inert", () => {
    const { container } = inProvider(<CourseElement preview={preview} />);
    expect(screen.getByText("Fundamentos")).toBeTruthy();
    expect(screen.getByText("Boas-vindas").getAttribute("href")).toBeNull();
    expect(screen.getByText(/Libera em 11 dias/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expectNoNetwork(container);
  });

  it("ProductElement is the product page: gallery, description, FAQ, the custom button", () => {
    const { container } = inProvider(<ProductElement preview={preview} />);
    expect(screen.getByRole("heading", { name: "Guia de precificação" })).toBeTruthy();
    expect(screen.getByText("Tudo sobre preço.")).toBeTruthy();
    expect(screen.getByText("Tem garantia?")).toBeTruthy();
    expect(container.querySelector("details")).toBeTruthy();
    const buy = screen.getByText("Quero o guia");
    expect(buy.tagName).toBe("BUTTON");
    fireEvent.click(buy);
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(container.querySelector(".infi-product-video")!.getAttribute("href")).toBeNull();
    expectNoNetwork(container);
  });
});

describe("appearance reaches the elements", () => {
  it("a preview's resolved appearance becomes the CSS variables on the element", () => {
    const { container } = render(<CheckoutElement preview={preview} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--infi-accent")).toBe("#0F766E");
    expect(root.style.getPropertyValue("--infi-background")).toBe("#111111");
    expect(root.style.getPropertyValue("--infi-font")).toContain("Lora");
    expect(root.style.getPropertyValue("--infi-radius")).toBe("24px");
    expect(root.style.getPropertyValue("--infi-button-radius")).toBe("9999px");
  });

  it("the provider's effective appearance styles native elements; the old {accentColor} shape still works", () => {
    const store = { slug: "loja", name: "Loja", items: [], appearance: { accentColor: "#000000", backgroundColor: "#FFFFFF", font: "system" as const, radius: "none" as const } };
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox" appearance={{ accentColor: "#ff0066", theme: "dark" }}>
        <StoreElement store={store} href={() => "#"} />
      </InfiProvider>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--infi-accent")).toBe("#ff0066");
    expect(root.style.getPropertyValue("--infi-radius")).toBe("0px");
  });

  it("the live checkout frame receives font and radius with the colors", () => {
    const { container } = render(
      <InfiProvider slug="loja" environment="sandbox" appearance={{ accentColor: "#0F766E", backgroundColor: "#FFFFFF", font: "inter", radius: "large" }}>
        <CheckoutElement linkToken="plink_abc" />
      </InfiProvider>,
    );
    const src = new URL(container.querySelector("iframe")!.src);
    expect(src.searchParams.get("accent")).toBe("#0F766E");
    expect(src.searchParams.get("font")).toBe("inter");
    expect(src.searchParams.get("radius")).toBe("large");
  });
});
