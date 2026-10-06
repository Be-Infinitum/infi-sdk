import {
  messagesFor,
  previewStorefrontItem,
  type Appearance,
  type ElementPreview,
  type ProductMedia,
  type StorefrontItem,
} from "@beinfi/elements";
import { useState, type CSSProperties } from "react";
import { accentStyle, buttonStyle, useAppearanceStyle } from "./appearance.js";
import { useElementLocale } from "./locale.js";
import { formatPrice } from "./store.js";

interface ProductElementCommon {
  /** Defaults to the product's `purchaseButtonText`, then "Comprar"/"Assinar". */
  buyLabel?: string;
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

export type ProductElementProps = ProductElementCommon &
  (
    | {
        /** A storefront item read on your server (`getStorefront`), media and FAQ included. */
        product: StorefrontItem;
        /** Where the buy button goes (your checkout page)… */
        href?: string;
        /** …or what it does, when the checkout is on the same page. */
        onBuy?: () => void;
        /** The store's effective appearance, when not on the provider. */
        appearance?: Partial<Appearance> | null;
        preview?: undefined;
      }
    | {
        /** The product page of `preview.product`, unsaved edits included. The button goes nowhere. */
        preview: ElementPreview;
        product?: undefined;
        href?: undefined;
        onBuy?: undefined;
        appearance?: undefined;
      }
  );

/**
 * The product page: media gallery, name, price, description, the buy button
 * (the product's own text and accent), the guarantee and an FAQ accordion.
 * Plain classes (`infi-product`, `infi-product-media`, `infi-product-faq`, …)
 * and the same CSS variables as the other elements.
 */
export function ProductElement(props: ProductElementProps) {
  const locale = useElementLocale(props.locale);
  const words = messagesFor(locale);
  const inPreview = props.preview !== undefined;
  const item = props.preview !== undefined ? previewStorefrontItem(props.preview.product) : props.product;
  const root = useAppearanceStyle(props.appearance, props.preview?.appearance);
  const media = item.media?.length
    ? item.media
    : item.imageUrl
      ? [{ type: "image" as const, url: item.imageUrl }]
      : [];
  const [selected, setSelected] = useState(0);
  const shown = media[Math.min(selected, media.length - 1)];
  const price = formatPrice(item.price, item.currency, locale);
  const cycle = item.billingCycle ? (words.cycle[item.billingCycle as keyof typeof words.cycle] ?? "") : "";
  const label = item.purchaseButtonText || props.buyLabel || (item.billingCycle ? words.subscribe : words.buy);

  return (
    <article
      className={["infi-product", props.className].filter(Boolean).join(" ")}
      data-infi-preview={inPreview ? "" : undefined}
      style={{
        display: "grid",
        gap: "2rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
        alignItems: "start",
        ...root,
        ...accentStyle(item.accentColor),
        ...props.style,
      }}
    >
      {shown ? (
        <div className="infi-product-media" style={{ display: "grid", gap: "0.75rem" }}>
          <MediaView media={shown} inPreview={inPreview} />
          {media.length > 1 ? (
            <div className="infi-product-thumbs" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {media.map((m, i) => (
                <button
                  key={`${m.url}-${i}`}
                  type="button"
                  aria-label={m.alt ?? `${i + 1}`}
                  aria-pressed={m === shown}
                  onClick={() => setSelected(i)}
                  style={{
                    width: 56,
                    height: 56,
                    padding: 0,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: m === shown ? "2px solid var(--infi-accent, #0a0a0a)" : "1px solid var(--infi-border, #e4e4e7)",
                    borderRadius: "var(--infi-radius, 12px)",
                    background: "transparent",
                  }}
                >
                  {m.type === "image" ? (
                    <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span aria-hidden>▶</span>
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="infi-product-info" style={{ display: "grid", gap: "1rem" }}>
        <h1 className="infi-product-name" style={{ margin: 0, fontSize: "1.75rem" }}>{item.name}</h1>
        <p className="infi-product-price" style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
          {price}
          {cycle ? <span style={{ fontSize: "0.875rem", fontWeight: 400 }}> {cycle}</span> : null}
        </p>
        {item.description ? (
          <p className="infi-product-description" style={{ margin: 0, whiteSpace: "pre-line", color: "var(--infi-muted, #71717a)" }}>
            {item.description}
          </p>
        ) : null}
        {inPreview || !props.href ? (
          <button
            type="button"
            className="infi-product-buy"
            onClick={inPreview ? undefined : props.onBuy}
            style={{ ...buttonStyle, width: "100%" }}
          >
            {label}
          </button>
        ) : (
          <a className="infi-product-buy" href={props.href} style={{ ...buttonStyle, width: "100%", boxSizing: "border-box" }}>
            {label}
          </a>
        )}
        {item.guaranteeDays ? (
          <small className="infi-product-guarantee" style={{ color: "var(--infi-muted, #71717a)" }}>
            {words.ui.guarantee(item.guaranteeDays)}
          </small>
        ) : null}
        {item.faq?.length ? (
          <section className="infi-product-faq">
            <h2 style={{ fontSize: "1.125rem" }}>{words.ui.faqTitle}</h2>
            {item.faq.map((f, i) => (
              <details
                key={`${i}-${f.question}`}
                className="infi-product-faq-item"
                style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--infi-border, #e4e4e7)" }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>{f.question}</summary>
                <p style={{ margin: "0.5rem 0 0", whiteSpace: "pre-line", color: "var(--infi-muted, #71717a)" }}>{f.answer}</p>
              </details>
            ))}
          </section>
        ) : null}
      </div>
    </article>
  );
}

// A video is shown as a tile, not a player frame: the page stays free of
// third-party iframes, and in preview nothing loads from anywhere but the
// image URLs the merchant gave.
function MediaView({ media, inPreview }: { media: ProductMedia; inPreview: boolean }) {
  const box: CSSProperties = {
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: "var(--infi-radius, 12px)",
    overflow: "hidden",
    background: "var(--infi-border, #e4e4e7)",
  };
  if (media.type === "image") {
    return <img className="infi-product-image" src={media.url} alt={media.alt ?? ""} style={{ ...box, objectFit: "cover", display: "block" }} />;
  }
  return (
    <a
      className="infi-product-video"
      href={inPreview ? undefined : media.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={media.alt ?? media.url}
      style={{ ...box, display: "grid", placeItems: "center", color: "inherit", textDecoration: "none", fontSize: "2.5rem" }}
    >
      ▶
    </a>
  );
}
