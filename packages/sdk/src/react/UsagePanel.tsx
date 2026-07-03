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
  /**
   * Hide the balance section. Useful on postpaid / no-credit models where the
   * wallet balance is empty and would render as a misleading "0".
   */
  hideCredit?: boolean;
  /** Hide the subscriptions section. */
  hideSubscriptions?: boolean;
  /**
   * Sensible default colors for the panel. `dark` renders light text so it
   * doesn't disappear on a dark host. Overridable via the `--infi-panel-*` CSS
   * variables or `classNames`. Default: `light`.
   */
  theme?: "light" | "dark";
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

const muted: CSSProperties = { color: "var(--infi-panel-muted, rgba(0, 0, 0, 0.55))" };

/** Theme presets for the panel's CSS variables. Merged into the root style so a
 * host can still override any single var (or all of them via `style`). */
const themeVars: Record<NonNullable<UsagePanelProps["theme"]>, CSSProperties> = {
  light: {
    "--infi-panel-fg": "inherit",
    "--infi-panel-muted": "rgba(0, 0, 0, 0.55)",
  } as CSSProperties,
  dark: {
    "--infi-panel-fg": "#f5f5f5",
    "--infi-panel-muted": "rgba(255, 255, 255, 0.6)",
  } as CSSProperties,
};

/** Render an ISO date-time as a readable date (e.g. "Jul 3, 2026"). */
function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Drop-in credit + usage panel. Renders the wallet balance, current-period
 * usage per meter, and live subscriptions from a `CustomerState`. Purely
 * presentational (no data fetching, no hooks) so it renders on the server where
 * the state is fetched, or inside a client tree.
 *
 * Theming: colors flow through the `--infi-panel-fg` / `--infi-panel-muted` CSS
 * variables. Pass `theme="dark"` for light-on-dark defaults, override the
 * variables from a host stylesheet, or target the `[data-infi-panel]` attribute
 * / `classNames` for finer control.
 */
export function UsagePanel({
  state,
  creditLabel = "credits",
  hideCredit = false,
  hideSubscriptions = false,
  theme = "light",
  className,
  classNames = {},
}: UsagePanelProps) {
  const meters = state.usage?.meters ?? [];
  const subscriptions = state.subscriptions ?? [];

  const from = formatDate(state.usage?.from);
  const to = formatDate(state.usage?.to);
  const period = from && to ? `${from} – ${to}` : from ?? to;

  const rootStyle: CSSProperties = { ...themeVars[theme], color: "var(--infi-panel-fg, inherit)" };

  return (
    <div className={className} data-infi-panel="usage" style={rootStyle}>
      {!hideCredit && (
        <section>
          <h3 className={classNames.heading}>Balance</h3>
          <div className={classNames.balance} style={{ fontSize: "1.75rem", fontWeight: 600 }}>
            {state.credit?.balance ?? "0"} <span style={{ fontSize: "0.9rem", fontWeight: 400 }}>{creditLabel}</span>
          </div>
        </section>
      )}

      <section>
        <h3 className={classNames.heading} style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span>Usage this period</span>
          {period && (
            <span style={{ ...muted, fontSize: "0.8rem", fontWeight: 400 }}>{period}</span>
          )}
        </h3>
        {meters.length === 0 ? (
          <p style={muted}>No usage yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {meters.map((m) => (
              <li key={m.meterId} className={classNames.meter} style={row}>
                <span>
                  {m.meter}
                  {m.eventCount ? (
                    <span style={{ ...muted, fontSize: "0.8rem" }}> ({m.eventCount} events)</span>
                  ) : null}
                </span>
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
