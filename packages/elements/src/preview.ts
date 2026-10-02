/**
 * Preview mode: the elements drawn from a draft the dashboard holds, with a
 * built-in example buyer, and never a call to Infi (spec-dashboard-v1). Every
 * date and number here is invented; nothing in it can be paid or redeemed.
 */
import type { Appearance } from "./appearance.js";
import type { PortalCourse, PortalLesson, PortalOrder, PortalSubscription } from "./portal.js";
import type { ProductPageFields, PublicStorefront, StorefrontItem } from "./storefront.js";

export type BillingCycle = "weekly" | "monthly" | "annual";

/** The product as the editor holds it (unsaved edits included). */
export interface PreviewProduct extends ProductPageFields {
  id?: string;
  name: string;
  description?: string | null;
  /** Decimal string, like every price the API returns. */
  price?: string | null;
  /** Defaults to BRL. */
  currency?: string;
  billingCycle?: BillingCycle | null;
  accentColor?: string | null;
  /** `false` keeps it off the store (its links still sell). */
  storeVisible?: boolean | null;
}

/** `GET /products/{id}/draft` — content and pricing as saved by autosave. */
export interface ProductDraft {
  content?: Partial<ProductPageFields> & {
    name?: string;
    description?: string | null;
    accentColor?: string | null;
    storeVisible?: boolean | null;
    postPurchaseRedirectUrl?: string | null;
  } | null;
  pricing?: { billingCycle?: BillingCycle | null; basePrice?: string | null } | null;
}

export function previewProductFromDraft(
  draft: ProductDraft,
  opts: { id?: string; currency?: string; fallbackName?: string } = {},
): PreviewProduct {
  const c = draft.content ?? {};
  return {
    id: opts.id,
    name: c.name || opts.fallbackName || "",
    description: c.description ?? null,
    price: draft.pricing?.basePrice ?? null,
    currency: opts.currency ?? "BRL",
    billingCycle: draft.pricing?.billingCycle ?? null,
    media: c.media ?? null,
    faq: c.faq ?? null,
    purchaseButtonText: c.purchaseButtonText ?? null,
    guaranteeDays: c.guaranteeDays ?? null,
    accentColor: c.accentColor ?? null,
    storeVisible: c.storeVisible ?? null,
  };
}

/** The course CMS's shape (`infi.courses.get`), loosely: unsaved rows have no id. */
export interface CourseDraft {
  id?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  modules: {
    id?: string;
    title: string;
    lessons: {
      id?: string;
      title: string;
      video?: { url: string } | null;
      videoUrl?: string | null;
      bodyMarkdown?: string | null;
      unlockAfterDays?: number | null;
      /** An unpublished lesson is not in the member view, as for a real student. */
      published?: boolean | null;
    }[];
  }[];
}

export interface ExampleBuyer {
  name: string;
  email: string;
  externalId: string;
}

/** Fictitious on purpose (example.com is reserved): never a real person's data. */
export const EXAMPLE_BUYER: Readonly<ExampleBuyer> = Object.freeze({
  name: "Ana Exemplo",
  email: "ana.exemplo@example.com",
  externalId: "exemplo",
});

/** How long ago the example buyer bought: drip lessons past this are locked. */
export const EXAMPLE_PURCHASE_DAYS_AGO = 10;

/** What every element's `preview` prop takes. Each reads the parts it draws. */
export interface ElementPreview {
  product: PreviewProduct;
  /**
   * The effective appearance to draw with — resolve the editor's levels with
   * `effectiveAppearance(resolveAppearance(levels))`. Wins over the provider's.
   */
  appearance?: Partial<Appearance> | null;
  merchant?: { name: string; logoUrl?: string | null };
  /** Defaults to EXAMPLE_BUYER. */
  buyer?: ExampleBuyer;
  /** CourseElement: the course being edited. */
  course?: CourseDraft;
  /** StoreElement: the rest of the shelf; the draft product replaces its own card. */
  store?: PublicStorefront;
  /** CheckoutElement: the tabs shown (default both) and the one open first. */
  methods?: ("pix" | "card")[];
  method?: "pix" | "card";
  /** Pins the invented dates (tests, screenshots). */
  now?: Date;
}

/** Not a pix payload: no EMV structure, so no bank app can read it as one. */
export const PREVIEW_PIX_CODE = "PREVIA-INFI-EXEMPLO-SEM-VALOR-NAO-PAGAR-0000000000";

const DAY = 86_400_000;

function iso(t: number): string {
  return new Date(t).toISOString();
}

export interface ExampleMemberView {
  buyer: ExampleBuyer;
  orders: PortalOrder[];
  subscriptions: PortalSubscription[];
}

/** One purchase of the draft product by the example buyer. */
export function exampleMemberView(preview: ElementPreview): ExampleMemberView {
  const now = (preview.now ?? new Date()).getTime();
  const p = preview.product;
  const currency = p.currency ?? "BRL";
  const amount = p.price ?? "0.00";
  const paidAt = now - EXAMPLE_PURCHASE_DAYS_AGO * DAY;
  const days = p.guaranteeDays ?? 7;
  const order: PortalOrder = {
    id: "preview-order",
    number: "0001",
    status: "paid",
    currency,
    total: amount,
    paidAt: iso(paidAt),
    receiptUrl: "#",
    lines: [{ description: p.name, quantity: "1", amount }],
    payment: {
      id: "preview-payment",
      method: "pix",
      status: "confirmed",
      amount,
      refundedAmount: "0.00",
      refundPendingAmount: "0.00",
    },
    guarantee: { days, endsAt: iso(paidAt + days * DAY), withinWindow: now < paidAt + days * DAY },
  };
  const subscriptions: PortalSubscription[] = p.billingCycle
    ? [
        {
          id: "preview-subscription",
          productName: p.name,
          status: "active",
          billingCycle: p.billingCycle,
          nextBillingDate: iso(paidAt + { weekly: 7, monthly: 30, annual: 365 }[p.billingCycle] * DAY),
          cancelAtPeriodEnd: false,
          card: { brand: "visa", last4: "4242" },
          canChangeCard: false,
        },
      ]
    : [];
  return { buyer: preview.buyer ?? { ...EXAMPLE_BUYER }, orders: [order], subscriptions };
}

/**
 * The course as the example buyer sees it: bought EXAMPLE_PURCHASE_DAYS_AGO,
 * drip past that locked, the first available lesson done.
 */
export function exampleCourse(preview: ElementPreview): PortalCourse {
  const now = (preview.now ?? new Date()).getTime();
  const since = now - EXAMPLE_PURCHASE_DAYS_AGO * DAY;
  const draft = preview.course ?? { modules: [] };
  let doneOne = false;
  const modules = draft.modules.map((m, mi) => {
    const moduleId = m.id ?? `preview-module-${mi + 1}`;
    const lessons: PortalLesson[] = m.lessons
      .filter((l) => l.published !== false)
      .map((l, li) => {
        const days = l.unlockAfterDays ?? 0;
        const locked = days > EXAMPLE_PURCHASE_DAYS_AGO;
        const completed = !locked && !doneOne;
        if (completed) doneOne = true;
        return {
          id: l.id ?? `${moduleId}-lesson-${li + 1}`,
          moduleId,
          title: l.title,
          position: li + 1,
          state: locked ? "locked" : "available",
          unlocksAt: locked ? iso(since + days * DAY) : undefined,
          hasVideo: Boolean(l.video?.url || l.videoUrl),
          hasText: Boolean(l.bodyMarkdown),
          completed,
        };
      });
    return { id: moduleId, title: m.title, lessons };
  });
  const all = modules.flatMap((m) => m.lessons);
  const completed = all.filter((l) => l.completed).length;
  const next = all.find((l) => l.state === "available" && !l.completed);
  return {
    id: draft.id ?? "preview-course",
    title: draft.title || preview.product.name,
    description: draft.description,
    coverUrl: draft.coverUrl,
    access: {
      key: "preview",
      name: preview.product.name,
      hasAccess: true,
      state: "active",
      since: iso(since),
    },
    progress: {
      completed,
      total: all.length,
      percent: all.length ? Math.round((completed / all.length) * 100) : 0,
    },
    continue: next ? { lessonId: next.id, moduleId: next.moduleId, title: next.title } : undefined,
    modules,
  };
}

/** The draft as a store card: what the public read would return once published. */
export function previewStorefrontItem(p: PreviewProduct): StorefrontItem {
  return {
    productId: p.id ?? "preview-product",
    name: p.name,
    description: p.description ?? null,
    imageUrl: p.media?.find((m) => m.type === "image")?.url ?? null,
    price: p.price ?? null,
    currency: p.currency ?? "BRL",
    billingCycle: p.billingCycle ?? null,
    requiresShipping: false,
    availableOnsite: false,
    accentColor: p.accentColor ?? null,
    media: p.media ?? null,
    faq: p.faq ?? null,
    purchaseButtonText: p.purchaseButtonText ?? null,
    guaranteeDays: p.guaranteeDays ?? null,
  };
}

/**
 * The shelf with the draft on it: its card replaces the published one (same
 * id) or joins at the end, and a hidden product (`storeVisible: false`) is
 * left off, exactly as the public read would.
 */
export function previewStorefront(preview: ElementPreview, base?: PublicStorefront): PublicStorefront {
  const store = preview.store ?? base ?? { slug: "preview", name: preview.merchant?.name ?? "", items: [] };
  const draft = previewStorefrontItem(preview.product);
  const hidden = preview.product.storeVisible === false;
  const items = store.items.filter((i) => i.productId !== draft.productId);
  const at = store.items.findIndex((i) => i.productId === draft.productId);
  if (!hidden) items.splice(at < 0 ? items.length : at, 0, draft);
  return { ...store, items };
}

/**
 * A QR-looking grid for the pix tab: three finder squares and a fixed
 * pattern. It encodes nothing, so a phone camera reads no pix from it.
 */
export function previewQrMatrix(size = 25): boolean[][] {
  let seed = 0x2f6b1d;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  const finder = (r: number, c: number): boolean | undefined => {
    for (const [fr, fc] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      const y = r - fr;
      const x = c - fc;
      if (y >= -1 && y <= 7 && x >= -1 && x <= 7) {
        if (y < 0 || y > 6 || x < 0 || x > 6) return false;
        const edge = y === 0 || y === 6 || x === 0 || x === 6;
        const core = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        return edge || core;
      }
    }
    return undefined;
  };
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => finder(r, c) ?? next() % 5 < 2),
  );
}
