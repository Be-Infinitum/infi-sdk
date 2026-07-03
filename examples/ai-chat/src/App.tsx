import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { CustomerState } from "@beinfi/sdk";
import { InfiLogin, UsagePanel } from "@beinfi/sdk/react";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [state, setState] = useState<CustomerState | null>(null);

  const refreshCredits = useCallback(async () => {
    const res = await fetch("/api/state");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setState((await res.json()) as CustomerState);
  }, []);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    onFinish: () => void refreshCredits(),
    // meter throws InsufficientCreditError → the server returns 402; refresh so the
    // balance (and the out-of-credit banner) reflects the empty wallet.
    onError: () => void refreshCredits(),
  });

  const balance = state ? Math.max(0, Math.floor(Number(state.credit.balance ?? 0))) : null;

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  if (authed === null) return <Centered>Carregando…</Centered>;
  if (!authed) {
    return (
      <Centered>
        <div className="w-full max-w-xs text-center">
          <h1 className="text-2xl font-semibold">AI Chat</h1>
          <p className="mt-2 text-zinc-400">Cada mensagem consome créditos pré-pagos do Infi.</p>
          {/* Embedded login: the email-code form renders in-app (no redirect to the
              hosted page). On verify it navigates to /callback, which the Hono server
              exchanges for a session — same backend, different UX from the hosted flow. */}
          <InfiLogin
            slug={import.meta.env.VITE_INFI_SLUG}
            baseUrl={import.meta.env.VITE_INFI_API_URL}
            redirectTo={`${window.location.origin}/callback`}
            sendLabel="Enviar código"
            verifyLabel="Entrar"
            className="mt-6 flex w-full flex-col gap-2.5"
            inputClassName="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-center text-[15px] placeholder:text-zinc-500 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/10"
            buttonClassName="w-full rounded-xl bg-white px-5 py-3 text-[15px] font-medium text-black transition hover:bg-zinc-200 disabled:opacity-50"
            onError={(e) => console.error("login:", e.message)}
          />
        </div>
      </Centered>
    );
  }

  const out = balance !== null && balance <= 0;

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-4">
      <header className="border-b border-white/10 py-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">AI Chat</span>
          <span className="text-sm text-zinc-400">{balance ?? "—"} créditos</span>
        </div>
        {state && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <UsagePanel state={state} creditLabel="créditos" hideSubscriptions />
          </div>
        )}
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.length === 0 && (
          <p className="text-center text-sm text-zinc-500">Manda a primeira mensagem.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user" ? "bg-indigo-600 text-white" : "bg-white/5 text-zinc-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {out ? (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-center text-sm">
          Seus créditos acabaram.
          <button onClick={buyCredits} className="ml-2 font-medium text-amber-300 underline">
            Comprar mais
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Escreva uma mensagem…"
            disabled={isLoading}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}

async function buyCredits() {
  const res = await fetch("/api/checkout", { method: "POST" });
  const data = (await res.json()) as { url?: string };
  if (data.url) window.location.href = data.url;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen items-center justify-center p-6">{children}</div>;
}
