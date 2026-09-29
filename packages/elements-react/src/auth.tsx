import { createPortalEmbed } from "@beinfi/elements";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useElementLocale } from "./locale.js";
import { useInfi } from "./provider.js";

/**
 * The store's login. `<LoginElement>` is Infi's frame (e-mail, then a
 * 6-digit code; anyone may sign in, bought or not). The frame hands the `bt_`
 * to YOUR route — `createInfiAuth().handlers` from @beinfi/nextjs — which
 * checks it with your `sk_` and keeps it in an HttpOnly cookie. `useInfiAuth`
 * reads that route; nothing here keeps the token.
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

  return { status, buyer, has, signOut, refresh };
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

export interface LoginElementProps {
  /** Your auth route (default `/api/infi/auth`). */
  endpoint?: string;
  /** Where to send the person after they sign in. */
  redirectTo?: string;
  onSignedIn?: (buyer: InfiBuyer) => void;
  onError?: (error: Error) => void;
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

export function LoginElement(props: LoginElementProps) {
  const infi = useInfi();
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const mode = infi.environment === "production" ? "live" : "sandbox";
  const locale = useElementLocale(props.locale);

  useEffect(() => {
    if (!host.current) return;
    const handle = createPortalEmbed(host.current, {
      slug: infi.slug,
      mode,
      view: "login",
      appUrl: infi.appUrl,
      locale,
      onToken: (token) => {
        const p = latest.current;
        void (async () => {
          const res = await fetch(p.endpoint ?? DEFAULT_AUTH_ENDPOINT, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!res.ok) throw new Error(`sign-in route answered ${res.status}`);
          const { buyer } = (await res.json()) as { buyer: InfiBuyer };
          notifyAuthChanged();
          p.onSignedIn?.(buyer);
          if (p.redirectTo) globalThis.location.assign(p.redirectTo);
        })().catch((err: unknown) => latest.current.onError?.(err instanceof Error ? err : new Error(String(err))));
      },
    });
    return () => handle.destroy();
  }, [infi.slug, mode, infi.appUrl, locale]);

  return <div ref={host} className={props.className} style={props.style} />;
}
