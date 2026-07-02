import type { CSSProperties } from "react";
import type { CustomerState } from "../types.js";

export interface UsagePanelProps {
  /**
   * The customer's state, fetched server-side with `infi.customers.state(id)`
   * (it needs the secret key — never fetch it from the browser). This component
   * is presentational: pass the data in and it renders.
   */
  state: CustomerState;
  /** Currency/label for the credit balance. Default: "credits". */
  creditLabel?: string;
  /** Hide the subscriptions section. */
  hideSubscriptions?: boolean;
  className?: string;
  /** Per-section class overrides (unstyled by default beyond minimal layout). */
  classNames?: {
    heading?: string;
    balance?: string;
    meter?: string;
    subscription?: string;
  };
}

const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.25rem 0",
};

/**
 * Drop-in credit + usage panel. Renders the wallet balance, current-period
 * usage per meter, and live subscriptions from a `CustomerState`. Purely
 * presentational (no data fetching, no hooks) so it renders on the server where
 * the state is fetched, or inside a client tree.
 */
export function UsagePanel({
  state,
  creditLabel = "credits",
  hideSubscriptions = false,
  className,
  classNames = {},
}: UsagePanelProps) {
  const meters = state.usage?.meters ?? [];
  const subscriptions = state.subscriptions ?? [];

  return (
    <div className={className} data-infi-panel="usage">
      <section>
        <h3 className={classNames.heading}>Balance</h3>
        <div className={classNames.balance} style={{ fontSize: "1.75rem", fontWeight: 600 }}>
          {state.credit?.balance ?? "0"} <span style={{ fontSize: "0.9rem", fontWeight: 400 }}>{creditLabel}</span>
        </div>
      </section>

      <section>
        <h3 className={classNames.heading}>Usage this period</h3>
        {meters.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No usage yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {meters.map((m) => (
              <li key={m.meterId} className={classNames.meter} style={row}>
                <span>{m.meter}</span>
                <span>
                  {m.totalValue} {m.unit}
                  {m.totalAmount ? ` · ${m.totalAmount}${m.currency ? ` ${m.currency}` : ""}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!hideSubscriptions && subscriptions.length > 0 && (
        <section>
          <h3 className={classNames.heading}>Subscriptions</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {subscriptions.map((s, i) => (
              <li key={s.id ?? i} className={classNames.subscription} style={row}>
                <span>{s.billingCycle ?? "subscription"}</span>
                <span>{s.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
