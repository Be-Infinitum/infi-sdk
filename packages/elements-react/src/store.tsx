import {
  messagesFor,
  previewStorefront,
  type ElementPreview,
  type PublicStorefront,
  type StorefrontItem,
} from "@beinfi/elements";
import type { CSSProperties, ReactNode } from "react";
import { accentStyle, buttonStyle, useAppearanceStyle } from "./appearance.js";
import { useElementLocale } from "./locale.js";

interface StoreElementCommon {
  /** Replace a card entirely; the default is image, name, description, price, button. */
  renderItem?: (item: StorefrontItem, defaults: { price: string; href: string }) => ReactNode;
  /** Defaults to the product's `purchaseButtonText`, then the element's language ("Comprar" / "Buy"). */
  buyLabel?: string;
  subscribeLabel?: string;
  /** pt-BR or en; defaults like every element (provider → <html lang> → browser). */
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

export type StoreElementProps = StoreElementCommon &
  (
    | {
        /**
         * The store, read on YOUR server with `getStorefront(apiUrl, slug)` from
         * @beinfi/elements: the browser cannot call the Infi API from your domain,
         * and prices must come from the server anyway.
         */
        store: PublicStorefront;
        /** Where each product's button goes (usually your product page with the checkout). */
        href: (item: StorefrontItem) => string;
        preview?: undefined;
      }
    | {
        /**
         * The shelf with the draft product on it (`preview.store`, else `store`);
         * buttons go nowhere.
         */
        preview: ElementPreview;
        store?: PublicStorefront;
        href?: (item: StorefrontItem) => string;
      }
  );

/** A price as the server computed it, formatted — never recomputed. */
export function formatPrice(price: string | null | undefined, currency: string, locale = "pt-BR"): string {
  if (!price) return "";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(price));
}

/**
 * The shelf. Styled by CSS variables (`--infi-accent`, `--infi-radius`,
 * `--infi-border`, `--infi-muted`, `--infi-font`, `--infi-background`) and
 * plain class names (`infi-store`, `infi-store-item`, …) so your own CSS wins.
 * Each card takes its product's own `accentColor`.
 */
export function StoreElement(props: StoreElementProps) {
  const { renderItem, buyLabel, subscribeLabel, locale: localeProp, className, style } = props;
  const locale = useElementLocale(localeProp);
  const words = messagesFor(locale);
  const inPreview = props.preview !== undefined;
  const store = props.preview !== undefined ? previewStorefront(props.preview, props.store) : props.store;
  const root = useAppearanceStyle(store.appearance, props.preview?.appearance);
  return (
    <div
      className={["infi-store", className].filter(Boolean).join(" ")}
      data-infi-preview={inPreview ? "" : undefined}
      style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", ...root, ...style }}
    >
      {store.items.map((item) => {
        const price = formatPrice(item.price, item.currency, locale);
        const to = inPreview ? "" : (props.href?.(item) ?? "");
        if (renderItem) return <div key={item.productId}>{renderItem(item, { price, href: to })}</div>;
        const label = item.purchaseButtonText || (item.billingCycle ? (subscribeLabel ?? words.subscribe) : (buyLabel ?? words.buy));
        const image = item.imageUrl ?? item.media?.find((m) => m.type === "image")?.url;
        return (
          <article
            key={item.productId}
            className="infi-store-item"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "1.5rem",
              border: "1px solid var(--infi-border, #e4e4e7)",
              borderRadius: "var(--infi-radius, 12px)",
              ...accentStyle(item.accentColor),
            }}
          >
            {image ? (
              <img
                className="infi-store-image"
                src={image}
                alt=""
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "var(--infi-radius, 12px)" }}
              />
            ) : null}
            <h3 className="infi-store-name" style={{ margin: 0, fontSize: "1.125rem" }}>{item.name}</h3>
            {item.description ? (
              <p className="infi-store-description" style={{ margin: 0, color: "var(--infi-muted, #71717a)" }}>
                {item.description}
              </p>
            ) : null}
            <p className="infi-store-price" style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 600 }}>
              {price}
              {item.billingCycle ? <span style={{ fontSize: "0.875rem", fontWeight: 400 }}> {words.cycle[item.billingCycle as keyof typeof words.cycle] ?? ""}</span> : null}
            </p>
            <a
              className="infi-store-action"
              href={inPreview ? undefined : to}
              aria-disabled={inPreview || undefined}
              style={{ ...buttonStyle, marginTop: "auto" }}
            >
              {label}
            </a>
          </article>
        );
      })}
    </div>
  );
}
