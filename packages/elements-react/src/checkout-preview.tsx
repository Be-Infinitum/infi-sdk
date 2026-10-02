import { PREVIEW_PIX_CODE, messagesFor, previewQrMatrix, type ElementPreview } from "@beinfi/elements";
import { useMemo, useState, type CSSProperties } from "react";
import { buttonStyle, useAppearanceStyle } from "./appearance.js";
import { formatPrice } from "./store.js";

export interface CheckoutPreviewProps {
  preview: ElementPreview;
  locale: string;
  className?: string;
  style?: CSSProperties;
}

const field: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.625rem 0.75rem",
  border: "1px solid var(--infi-border, #e4e4e7)",
  borderRadius: "var(--infi-button-radius, var(--infi-radius, 12px))",
  background: "transparent",
  color: "inherit",
  font: "inherit",
};

/** A look-alike of the checkout drawn here, not in Infi's frame: nothing loads, nothing charges. */
export function CheckoutPreview({ preview, locale, className, style }: CheckoutPreviewProps) {
  const words = messagesFor(locale);
  const ui = words.ui;
  const { product, merchant } = preview;
  const methods = preview.methods?.length ? preview.methods : (["pix", "card"] as const);
  const [method, setMethod] = useState<"pix" | "card">(
    preview.method && methods.includes(preview.method) ? preview.method : methods[0]!,
  );
  const root = useAppearanceStyle(null, preview.appearance);
  const image = product.media?.find((m) => m.type === "image");
  const price = formatPrice(product.price, product.currency ?? "BRL", locale);
  const cycle = product.billingCycle ? words.cycle[product.billingCycle] : "";

  return (
    <div
      className={["infi-checkout", "infi-checkout-preview", className].filter(Boolean).join(" ")}
      data-infi-preview=""
      style={{ display: "grid", gap: "1rem", padding: "1.25rem", ...root, ...style }}
    >
      <small className="infi-preview-badge" style={{ color: "var(--infi-muted, #71717a)" }}>{ui.previewBadge}</small>
      {merchant?.name ? <strong className="infi-checkout-merchant">{merchant.name}</strong> : null}
      <section className="infi-checkout-summary" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {image ? (
          <img
            src={image.url}
            alt={image.alt ?? ""}
            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--infi-radius, 12px)" }}
          />
        ) : null}
        <div>
          <div className="infi-checkout-product" style={{ fontWeight: 600 }}>{product.name}</div>
          <div className="infi-checkout-price">
            {price}
            {cycle ? <span style={{ fontSize: "0.875rem" }}> {cycle}</span> : null}
          </div>
        </div>
      </section>
      <div className="infi-checkout-coupon" style={{ display: "flex", gap: "0.5rem" }}>
        <input aria-label={ui.coupon} placeholder={ui.coupon} disabled style={field} />
        <button type="button" disabled style={{ ...field, width: "auto" }}>{ui.applyCoupon}</button>
      </div>
      <div role="tablist" className="infi-checkout-methods" style={{ display: "flex", gap: "0.5rem" }}>
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            style={{
              ...field,
              cursor: "pointer",
              fontWeight: method === m ? 600 : 400,
              borderColor: method === m ? "var(--infi-accent, #0a0a0a)" : undefined,
            }}
          >
            {m === "pix" ? ui.pix : ui.card}
          </button>
        ))}
      </div>
      {method === "pix" ? <PixPanel instructions={ui.pixInstructions} copy={ui.copyCode} /> : <CardPanel ui={ui} />}
      <button type="button" className="infi-checkout-pay" style={{ ...buttonStyle, width: "100%" }}>
        {product.purchaseButtonText || `${ui.pay} ${price}`.trim()}
      </button>
      {product.guaranteeDays ? (
        <small className="infi-checkout-guarantee" style={{ color: "var(--infi-muted, #71717a)" }}>
          {ui.guarantee(product.guaranteeDays)}
        </small>
      ) : null}
    </div>
  );
}

function PixPanel({ instructions, copy }: { instructions: string; copy: string }) {
  const matrix = useMemo(() => previewQrMatrix(), []);
  const n = matrix.length;
  return (
    <div role="tabpanel" className="infi-checkout-pix" style={{ display: "grid", gap: "0.75rem", justifyItems: "center" }}>
      <svg
        role="img"
        aria-label="QR code"
        data-infi-preview-qr=""
        viewBox={`-2 -2 ${n + 4} ${n + 4}`}
        width={180}
        height={180}
        style={{ background: "#fff", borderRadius: 8 }}
      >
        {matrix.flatMap((row, y) =>
          row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0a0a0a" /> : null)),
        )}
      </svg>
      <small style={{ color: "var(--infi-muted, #71717a)", textAlign: "center" }}>{instructions}</small>
      <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
        <input readOnly aria-label={copy} value={PREVIEW_PIX_CODE} style={{ ...field, fontFamily: "monospace", fontSize: "0.75rem" }} />
        <button type="button" disabled style={{ ...field, width: "auto" }}>{copy}</button>
      </div>
    </div>
  );
}

function CardPanel({ ui }: { ui: ReturnType<typeof messagesFor>["ui"] }) {
  // Disabled look-alikes: in the real checkout these are the provider's own frame.
  const input = (label: string, placeholder: string) => (
    <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.875rem" }}>
      {label}
      <input disabled placeholder={placeholder} style={field} />
    </label>
  );
  return (
    <div role="tabpanel" className="infi-checkout-card" style={{ display: "grid", gap: "0.75rem" }}>
      {input(ui.cardNumber, "0000 0000 0000 0000")}
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr" }}>
        {input(ui.cardExpiry, "MM/AA")}
        {input(ui.cardCvc, "123")}
      </div>
      {input(ui.cardName, "")}
    </div>
  );
}
