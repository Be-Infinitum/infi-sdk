import { messagesFor } from "@beinfi/elements";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useElementLocale } from "./locale.js";

/**
 * The store's login: "Entrar com Infi" (ADR 0007 in the backend). The button
 * goes to YOUR route — `createInfiAuth().handle` from @beinfi/sdk — which runs
 * the OAuth flow with Infi and keeps the buyer token in an HttpOnly cookie.
 * `useInfiAuth` reads that route; nothing in the browser holds the token.
 */
export const DEFAULT_AUTH_ENDPOINT = "/api/infi/auth";
const CHANGED = "infi:auth-changed";

export interface InfiBuyerAccess {
  productId: string;
  key?: string;
  name: string;
  kind: "purchase" | "subscription";
  subscriptionStatus?: "active" | "trialing" | "past_due";
  renewsAt?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface InfiBuyer {
  buyer: { email?: string; name?: string; customerIds: string[]; externalIds: string[] };
  origin: "code" | "merchant";
  expiresAt: string;
  access: InfiBuyerAccess[];
}

export type InfiAuthState = {
  status: "loading" | "signed_in" | "signed_out";
  buyer: InfiBuyer | null;
  /** Bought (not refunded) or subscribed and running, by manifest key or product id. */
  has(keyOrProductId: string): boolean;
  /** Go to "Entrar com Infi", coming back to `next` (default: this page). */
  signIn(next?: string): void;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
};

/** Tell every useInfiAuth on the page to read the session again (you signed in or out yourself). */
export function notifyAuthChanged(): void {
  globalThis.dispatchEvent(new Event(CHANGED));
}

async function readSession(endpoint: string): Promise<InfiBuyer | null> {
  const res = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { buyer: InfiBuyer | null }).buyer;
}

export function useInfiAuth(opts: { endpoint?: string } = {}): InfiAuthState {
  const endpoint = opts.endpoint ?? DEFAULT_AUTH_ENDPOINT;
  const [buyer, setBuyer] = useState<InfiBuyer | null>(null);
  const [status, setStatus] = useState<InfiAuthState["status"]>("loading");

  const refresh = useCallback(async () => {
    const b = await readSession(endpoint).catch(() => null);
    setBuyer(b);
    setStatus(b ? "signed_in" : "signed_out");
  }, [endpoint]);

  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    globalThis.addEventListener(CHANGED, on);
    return () => globalThis.removeEventListener(CHANGED, on);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch(endpoint, { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    notifyAuthChanged();
  }, [endpoint]);

  const has = useCallback(
    (k: string) => !!buyer?.access.some((a) => a.key === k || a.productId === k),
    [buyer],
  );

  const signIn = useCallback(
    (next?: string) => globalThis.location.assign(signInHref({ endpoint, next })),
    [endpoint],
  );

  return { status, buyer, has, signIn, signOut, refresh };
}

/** Renders its children only once someone is signed in. */
export function SignedIn({ children, endpoint }: { children: ReactNode; endpoint?: string }) {
  const { status } = useInfiAuth({ endpoint });
  return status === "signed_in" ? <>{children}</> : null;
}

/** Renders its children only once it is known nobody is signed in. */
export function SignedOut({ children, endpoint }: { children: ReactNode; endpoint?: string }) {
  const { status } = useInfiAuth({ endpoint });
  return status === "signed_out" ? <>{children}</> : null;
}

/** Where "Entrar com Infi" starts: your auth route's /sign-in, back to `next`. */
export function signInHref(opts: { endpoint?: string; next?: string; locale?: string } = {}): string {
  const next = opts.next ?? (globalThis.location ? globalThis.location.pathname + globalThis.location.search : "/");
  const q = new URLSearchParams({ next });
  if (opts.locale) q.set("locale", opts.locale);
  return `${(opts.endpoint ?? DEFAULT_AUTH_ENDPOINT).replace(/\/$/, "")}/sign-in?${q.toString()}`;
}

export interface LoginElementProps {
  /** Your auth route (default `/api/infi/auth`, `createInfiAuth().handle` from @beinfi/sdk). */
  endpoint?: string;
  /** Where to come back after signing in (default: this page). A path on your site. */
  redirectTo?: string;
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
  /** Replace the label ("Entrar com Infi" / "Sign in with Infi"). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Infi's mark, drawn inline so the button needs no asset. */
function InfiMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="6" fill="currentColor" opacity="0.12" />
      <path
        d="M7.5 15.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5c2.6 0 3.9 3.5 4.5 3.5s1.9-3.5 4.5-3.5c1.9 0 3.5 1.6 3.5 3.5s-1.6 3.5-3.5 3.5c-2.6 0-3.9-3.5-4.5-3.5s-1.9 3.5-4.5 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * "Entrar com Infi": a link to your auth route, which sends the person to
 * Infi's sign-in page (e-mail code or Google) and back here signed in. A plain
 * link on purpose — it works before hydration and in any framework. Style it
 * with `className` / `style`, or the `infi-sign-in` class.
 */
export function LoginElement(props: LoginElementProps) {
  const locale = useElementLocale(props.locale);
  const words = messagesFor(locale);
  // The href depends on the page's own path; the server renders it without
  // one, and the browser fills it in.
  const [href, setHref] = useState(() =>
    signInHref({ endpoint: props.endpoint, next: props.redirectTo ?? "/", locale }),
  );
  useEffect(() => {
    setHref(signInHref({ endpoint: props.endpoint, next: props.redirectTo, locale }));
  }, [props.endpoint, props.redirectTo, locale]);

  return (
    <a
      href={href}
      className={["infi-sign-in", props.className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        height: "2.5rem",
        padding: "0 1rem",
        borderRadius: "var(--infi-radius, 10px)",
        border: "1px solid var(--infi-border, #e4e4e7)",
        background: "var(--infi-background, #fff)",
        color: "var(--infi-foreground, #0a0a0a)",
        fontWeight: 500,
        fontSize: "0.875rem",
        textDecoration: "none",
        ...props.style,
      }}
    >
      <InfiMark />
      {props.children ?? words.signInWithInfi}
    </a>
  );
}
