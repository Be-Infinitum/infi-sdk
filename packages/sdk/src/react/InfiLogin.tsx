"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DEFAULT_API_BASE, type MagicLinkMode } from "../types.js";

export interface InfiLoginProps {
  /** Publishable API key (`pk_live_...`). Safe for the browser. */
  publishableKey: string;
  /** Where the magic link should land after the user clicks it. */
  redirectTo: string;
  /** API base URL. Default: https://api.beinfi.com */
  baseUrl?: string;
  mode?: MagicLinkMode;
  state?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  sentMessage?: string;
  submitLabel?: string;
  onSent?: () => void;
  onError?: (error: Error) => void;
}

export function InfiLogin({
  publishableKey,
  redirectTo,
  baseUrl = DEFAULT_API_BASE,
  mode = "embedded",
  state,
  className,
  inputClassName,
  buttonClassName,
  sentMessage = "Check your email for a sign-in link.",
  submitLabel = "Continue with email",
  onSent,
  onError,
}: InfiLoginProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/identity/magic-link`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, redirectTo, mode, state }),
        });
        if (res.status !== 202) {
          const err = new Error("Could not send magic link");
          onError?.(err);
          throw err;
        }
        setSent(true);
        onSent?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, email, mode, onError, onSent, publishableKey, redirectTo, state],
  );

  if (sent) {
    return (
      <p className={className} role="status">
        {sentMessage}
      </p>
    );
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      <label>
        <span className="sr-only">Email</span>
        <input
          className={inputClassName}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button className={buttonClassName} type="submit" disabled={loading}>
        {loading ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
