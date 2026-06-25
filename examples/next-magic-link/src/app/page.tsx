"use client";

import { useState } from "react";
import { InfiLogin, startHostedLogin } from "@infi/sdk/react";
import { Infi } from "@infi/sdk";

const apiUrl = process.env.NEXT_PUBLIC_INFI_API_URL ?? "http://localhost:8088";
const authBaseUrl = process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL ?? apiUrl;
const pk = process.env.NEXT_PUBLIC_INFI_PK ?? "";
const slug = process.env.INFI_APP_SLUG ?? "sdk-test";
const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/callback` : "/callback";

type Tab = "embedded" | "hosted" | "headless";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("embedded");
  const [email, setEmail] = useState("");
  const [headlessSent, setHeadlessSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendHeadless() {
    setError(null);
    try {
      const infi = new Infi({ publishableKey: pk, baseUrl: apiUrl });
      await infi.sendMagicLink({ email, redirectTo, mode: "embedded" });
      setHeadlessSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <h1>Infi magic-link demo</h1>
      <p>Three co-equal delivery modes (spec §2).</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["embedded", "hosted", "headless"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}>
            {t}
          </button>
        ))}
      </div>

      {tab === "embedded" && (
        <section>
          <h2>Mode A — &lt;InfiLogin /&gt;</h2>
          <InfiLogin
            publishableKey={pk}
            redirectTo={redirectTo}
            baseUrl={apiUrl}
            className="infi-login"
            inputClassName="infi-input"
            buttonClassName="infi-button"
          />
        </section>
      )}

      {tab === "hosted" && (
        <section>
          <h2>Mode B — Hosted login</h2>
          <button
            type="button"
            onClick={() =>
              startHostedLogin({ slug, redirectTo, authBaseUrl })
            }
          >
            Sign in with Infi
          </button>
        </section>
      )}

      {tab === "headless" && (
        <section>
          <h2>Mode C — Headless SDK</h2>
          {headlessSent ? (
            <p>Check your email.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendHeadless();
              }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <button type="submit">Send magic link</button>
            </form>
          )}
        </section>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
