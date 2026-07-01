"use client";

import { useEffect, useState } from "react";
import { InfiLogin, startHostedLogin } from "@beinfi/sdk/react";
import { Infi } from "@beinfi/sdk";
import {
  buttonClass,
  errorClass,
  inputClass,
  loginFormClass,
  successClass,
} from "@/lib/styles";

const apiUrl = process.env.NEXT_PUBLIC_INFI_API_URL ?? "http://localhost:8088";
const authBaseUrl = process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL ?? apiUrl;
const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "dev";

type Tab = "embedded" | "hosted" | "headless";

const TABS: { id: Tab; label: string }[] = [
  { id: "embedded", label: "Embedded" },
  { id: "hosted", label: "Hosted" },
  { id: "headless", label: "Headless" },
];

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("embedded");
  const [error, setError] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState("/callback");

  // Headless state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [headlessStep, setHeadlessStep] = useState<"email" | "code">("email");

  useEffect(() => {
    setRedirectTo(`${window.location.origin}/callback`);
  }, []);

  async function sendHeadless() {
    setError(null);
    try {
      const infi = new Infi({ baseUrl: apiUrl });
      await infi.sendEmailCode({ slug, email, redirectTo });
      setHeadlessStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function verifyHeadless() {
    setError(null);
    try {
      const infi = new Infi({ baseUrl: apiUrl });
      const { redirectUrl } = await infi.verifyEmailCode({ slug, email, code });
      window.location.assign(redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <header className="mb-8">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Beinfi SDK
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Email-code demo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Three co-equal delivery modes — pick one and sign in with a 6-digit code.
          </p>
        </header>

        <div
          className="mb-8 flex rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Auth delivery mode"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "embedded" && (
          <section role="tabpanel" className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mode A — InfiLogin</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop-in React component: enter email, enter the code, redirect.
              </p>
            </div>
            <InfiLogin
              slug={slug}
              redirectTo={redirectTo}
              baseUrl={apiUrl}
              className={loginFormClass}
              inputClassName={inputClass}
              buttonClassName={buttonClass}
              onError={(e) => setError(e.message)}
            />
          </section>
        )}

        {tab === "hosted" && (
          <section role="tabpanel" className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mode B — Hosted login</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Redirect to the Beinfi-hosted login; callback exchanges the auth code.
              </p>
            </div>
            <button
              type="button"
              className={buttonClass}
              onClick={() => startHostedLogin({ slug, redirectTo, authBaseUrl })}
            >
              Sign in with Infi
            </button>
          </section>
        )}

        {tab === "headless" && (
          <section role="tabpanel" className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mode C — Headless SDK</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Call{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">sendEmailCode</code> then{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">verifyEmailCode</code> from
                your own UI.
              </p>
            </div>
            {headlessStep === "email" ? (
              <form
                className={loginFormClass}
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendHeadless();
                }}
              >
                <label className="sr-only" htmlFor="headless-email">
                  Email
                </label>
                <input
                  id="headless-email"
                  className={inputClass}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
                <button type="submit" className={buttonClass}>
                  Send code
                </button>
              </form>
            ) : (
              <form
                className={loginFormClass}
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyHeadless();
                }}
              >
                <p className={successClass} role="status">
                  Code sent to {email}. Enter it below.
                </p>
                <label className="sr-only" htmlFor="headless-code">
                  Verification code
                </label>
                <input
                  id="headless-code"
                  className={inputClass}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                />
                <button type="submit" className={buttonClass}>
                  Verify
                </button>
              </form>
            )}
          </section>
        )}

        {error && (
          <p className={`${errorClass} mt-6`} role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          App slug:{" "}
          <code className="rounded bg-muted px-1">{slug}</code> — set{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_INFI_APP_SLUG</code> in{" "}
          <code className="rounded bg-muted px-1">.env.local</code>.
        </p>
      </div>
    </main>
  );
}
