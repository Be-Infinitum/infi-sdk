"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DEFAULT_API_BASE } from "../types.js";

export interface InfiLoginProps {
  /** App slug the login is scoped to. */
  slug: string;
  /** API base URL. Default: https://api.beinfi.com */
  baseUrl?: string;
  /** Where to land after the auth code is verified (must be in the app allowlist). */
  redirectTo?: string;
  /** Opaque value echoed back on the redirect URL. */
  state?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  sendLabel?: string;
  verifyLabel?: string;
  /** Fired after the code email is sent. */
  onSent?: () => void;
  /** Fired when verification fails or sending errors. */
  onError?: (error: Error) => void;
  /**
   * Called with the redirect URL after a successful verification. Defaults to
   * navigating the browser to it. Override to handle the redirect yourself.
   */
  onVerified?: (redirectUrl: string) => void;
}

function appUrl(baseUrl: string, slug: string, action: string): string {
  return `${baseUrl.replace(/\/$/, "")}/identity/apps/${encodeURIComponent(slug)}/${action}`;
}

/**
 * Drop-in two-step email-code login: enter email → enter the 6-digit code,
 * then redirect to the URL the backend returns (carrying a single-use auth code).
 */
export function InfiLogin({
  slug,
  baseUrl = DEFAULT_API_BASE,
  redirectTo,
  state,
  className,
  inputClassName,
  buttonClassName,
  sendLabel = "Send code",
  verifyLabel = "Verify",
  onSent,
  onError,
  onVerified,
}: InfiLoginProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const res = await fetch(appUrl(baseUrl, slug, "email-code"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, redirectTo, state }),
        });
        if (res.status !== 202) {
          throw new Error("Could not send verification code");
        }
        setStep("code");
        onSent?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, slug, email, redirectTo, state, onSent, onError],
  );

  const verifyCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const res = await fetch(appUrl(baseUrl, slug, "verify-code"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });
        if (!res.ok) {
          throw new Error("Invalid or expired code");
        }
        const { redirectUrl } = (await res.json()) as { redirectUrl: string };
        if (onVerified) {
          onVerified(redirectUrl);
        } else if (typeof window !== "undefined") {
          window.location.assign(redirectUrl);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, slug, email, code, onVerified, onError],
  );

  if (step === "code") {
    return (
      <form className={className} onSubmit={verifyCode}>
        <input
          className={inputClassName}
          type="text"
          name="code"
          aria-label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className={buttonClassName} type="submit" disabled={loading}>
          {loading ? "Verifying…" : verifyLabel}
        </button>
      </form>
    );
  }

  return (
    <form className={className} onSubmit={sendCode}>
      <input
        className={inputClassName}
        type="email"
        name="email"
        aria-label="Email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className={buttonClassName} type="submit" disabled={loading}>
        {loading ? "Sending…" : sendLabel}
      </button>
    </form>
  );
}
