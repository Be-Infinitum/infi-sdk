import { describe, expect, it } from "vitest";
import {
  EXAMPLE_BUYER,
  PREVIEW_PIX_CODE,
  exampleCourse,
  exampleMemberView,
  previewProductFromDraft,
  previewQrMatrix,
  previewStorefront,
  type ElementPreview,
} from "./preview.js";

const now = new Date("2026-09-28T12:00:00Z");
const product = { id: "p1", name: "Guia", price: "97.00", currency: "BRL", guaranteeDays: 14 };

describe("preview fixtures", () => {
  it("the member view is one paid purchase of the draft by the example buyer", () => {
    const v = exampleMemberView({ product, now });
    expect(v.buyer).toEqual(EXAMPLE_BUYER);
    expect(v.orders).toHaveLength(1);
    expect(v.orders[0]).toMatchObject({ status: "paid", total: "97.00", lines: [{ description: "Guia" }] });
    expect(v.orders[0]!.guarantee).toMatchObject({ days: 14, withinWindow: true });
    expect(v.subscriptions).toEqual([]);
  });

  it("a recurring draft also shows as an active subscription", () => {
    const v = exampleMemberView({ product: { ...product, billingCycle: "monthly" }, now });
    expect(v.subscriptions[0]).toMatchObject({ productName: "Guia", status: "active", billingCycle: "monthly" });
  });

  it("the course has sample progress: first lesson done, drip past the purchase locked, drafts hidden", () => {
    const preview: ElementPreview = {
      product,
      now,
      course: {
        title: "Curso",
        modules: [
          {
            title: "Módulo 1",
            lessons: [
              { title: "Boas-vindas", videoUrl: "https://vimeo.com/1" },
              { title: "Leitura", bodyMarkdown: "# oi" },
              { title: "Semana três", unlockAfterDays: 21 },
              { title: "Rascunho", published: false },
            ],
          },
        ],
      },
    };
    const c = exampleCourse(preview);
    const lessons = c.modules![0]!.lessons;
    expect(lessons.map((l) => l.title)).toEqual(["Boas-vindas", "Leitura", "Semana três"]);
    expect(lessons[0]).toMatchObject({ completed: true, hasVideo: true, state: "available" });
    expect(lessons[2]).toMatchObject({ state: "locked", unlocksAt: "2026-10-09T12:00:00.000Z" });
    expect(c.progress).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(c.continue).toMatchObject({ title: "Leitura" });
  });

  it("the shelf takes the draft in place of the published card, and leaves a hidden one off", () => {
    const store = {
      slug: "loja",
      name: "Loja",
      items: [
        { productId: "p0", name: "Outro", currency: "BRL", requiresShipping: false, availableOnsite: false },
        { productId: "p1", name: "Guia velho", currency: "BRL", requiresShipping: false, availableOnsite: false },
      ],
    };
    expect(previewStorefront({ product, store }).items.map((i) => i.name)).toEqual(["Outro", "Guia"]);
    expect(previewStorefront({ product: { ...product, storeVisible: false }, store }).items.map((i) => i.name)).toEqual([
      "Outro",
    ]);
  });

  it("maps a saved draft to the preview product", () => {
    const p = previewProductFromDraft(
      { content: { name: "Guia", purchaseButtonText: "Quero" }, pricing: { basePrice: "10.00", billingCycle: null } },
      { id: "p1" },
    );
    expect(p).toMatchObject({ id: "p1", name: "Guia", price: "10.00", currency: "BRL", purchaseButtonText: "Quero" });
  });

  it("the sample pix is not a pix payload and the QR is a fixed pattern", () => {
    expect(PREVIEW_PIX_CODE.startsWith("000201")).toBe(false);
    expect(previewQrMatrix()).toEqual(previewQrMatrix());
    expect(previewQrMatrix(25)).toHaveLength(25);
  });
});
