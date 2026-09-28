import { messagesFor, type PublicStorefront, type StorefrontItem } from "@beinfi/elements";
import type { CSSProperties, ReactNode } from "react";
import { useElementLocale } from "./locale.js";

export interface StoreElementProps {
  /**
   * The store, read on YOUR server with `getStorefront(apiUrl, slug)` from
   * @beinfi/elements: the browser cannot call the Infi API from your domain,
   * and prices must come from the server anyway.
   */
  store: PublicStorefront;
  /** Where each product's button goes (usually your product page with the checkout). */
  href: (item: StorefrontItem) => string;
  /** Replace a card entirely; the default is name, description, price, button. */
  renderItem?: (item: StorefrontItem, defaults: { price: string; href: string }) => ReactNode;
  /** Defaults to the element's language ("Comprar" / "Buy"). */
  buyLabel?: string;
  subscribeLabel?: string;
  /** pt-BR or en; defaults like every element (provider → <html lang> → browser). */
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

/** A price as the server computed it, formatted — never recomputed. */
export function formatPrice(price: string | null | undefined, currency: string, locale = "pt-BR"): string {
  if (!price) return "";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(price));
}

/**
 * The shelf. Styled by CSS variables (`--infi-accent`, `--infi-radius`,
 * `--infi-border`, `--infi-muted`) and plain class names (`infi-store`,
 * `infi-store-item`, …) so your own CSS wins.
 */
export function StoreElement({
  store,
  href,
  renderItem,
  buyLabel,
  subscribeLabel,
  locale: localeProp,
  className,
  style,
}: StoreElementProps) {
  const locale = useElementLocale(localeProp);
  const words = messagesFor(locale);
  return (
    <div
      className={["infi-store", className].filter(Boolean).join(" ")}
      style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", ...style }}
    >
      {store.items.map((item) => {
        const price = formatPrice(item.price, item.currency, locale);
        const to = href(item);
        if (renderItem) return <div key={item.productId}>{renderItem(item, { price, href: to })}</div>;
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
            }}
          >
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
              href={to}
              style={{
                marginTop: "auto",
                padding: "0.625rem 1rem",
                textAlign: "center",
                borderRadius: "var(--infi-radius, 12px)",
                background: "var(--infi-accent, #0a0a0a)",
                color: "var(--infi-accent-foreground, #fff)",
                textDecoration: "none",
              }}
            >
              {item.billingCycle ? (subscribeLabel ?? words.subscribe) : (buyLabel ?? words.buy)}
            </a>
          </article>
        );
      })}
    </div>
  );
}
