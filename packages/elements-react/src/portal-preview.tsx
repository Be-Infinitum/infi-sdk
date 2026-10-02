import { exampleMemberView, messagesFor, type ElementPreview } from "@beinfi/elements";
import type { CSSProperties } from "react";
import { useAppearanceStyle } from "./appearance.js";
import { formatPrice } from "./store.js";

export interface PortalPreviewProps {
  preview: ElementPreview;
  locale: string;
  className?: string;
  style?: CSSProperties;
}

const card: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  padding: "1rem",
  border: "1px solid var(--infi-border, #e4e4e7)",
  borderRadius: "var(--infi-radius, 12px)",
};

/** "Minhas compras" of the example buyer, drawn here: the real one is Infi's frame. */
export function PortalPreview({ preview, locale, className, style }: PortalPreviewProps) {
  const words = messagesFor(locale);
  const ui = words.ui;
  const view = exampleMemberView(preview);
  const root = useAppearanceStyle(null, preview.appearance);
  const date = (iso?: string) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "");
  return (
    <section
      className={["infi-portal", "infi-portal-preview", className].filter(Boolean).join(" ")}
      data-infi-preview=""
      style={{ display: "grid", gap: "1rem", padding: "1.25rem", ...root, ...style }}
    >
      <small className="infi-preview-badge" style={{ color: "var(--infi-muted, #71717a)" }}>{ui.previewBadge}</small>
      <header>
        <h2 style={{ margin: 0 }}>{words.portalTitle}</h2>
        <div className="infi-portal-buyer" style={{ color: "var(--infi-muted, #71717a)" }}>
          {view.buyer.name} · {view.buyer.email}
        </div>
      </header>
      <h3 style={{ margin: 0 }}>{ui.orders}</h3>
      {view.orders.map((o) => (
        <article key={o.id} className="infi-portal-order" style={card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>
              {ui.order} #{o.number}
            </strong>
            <span>{ui.paid}</span>
          </div>
          {o.lines.map((l) => (
            <div key={l.description}>{l.description}</div>
          ))}
          <div>
            {ui.total}: {formatPrice(o.total, o.currency, locale)} · {date(o.paidAt)}
          </div>
          {o.guarantee.withinWindow ? (
            <small style={{ color: "var(--infi-muted, #71717a)" }}>
              {ui.guaranteeUntil} {date(o.guarantee.endsAt)}
            </small>
          ) : null}
        </article>
      ))}
      {view.subscriptions.length ? <h3 style={{ margin: 0 }}>{ui.subscriptions}</h3> : null}
      {view.subscriptions.map((s) => (
        <article key={s.id} className="infi-portal-subscription" style={card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{s.productName}</strong>
            <span>{ui.active}</span>
          </div>
          <small style={{ color: "var(--infi-muted, #71717a)" }}>
            {ui.nextBilling}: {date(s.nextBillingDate)}
          </small>
        </article>
      ))}
    </section>
  );
}
