import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const refreshCredits = useCallback(async () => {
    const res = await fetch("/api/credits");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const data = (await res.json()) as { balance: string };
    setBalance(Math.max(0, Math.floor(Number(data.balance))));
  }, []);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    onFinish: () => void refreshCredits(),
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  if (authed === null) return <Centered>Carregando…</Centered>;
  if (!authed) {
    return (
      <Centered>
        <div className="text-center">
          <h1 className="text-2xl font-semibold">AI Chat</h1>
          <p className="mt-2 text-zinc-400">Cada mensagem consome créditos pré-pagos do Infi.</p>
          <a
            href="/api/auth/login"
            className="mt-6 inline-block rounded-xl bg-white px-5 py-2.5 font-medium text-black hover:bg-zinc-200"
          >
            Entrar com Infi
          </a>
        </div>
      </Centered>
    );
  }

  const out = balance !== null && balance <= 0;

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-white/10 py-4">
        <span className="font-semibold">AI Chat</span>
        <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-300">
          {balance ?? "—"} créditos
        </span>
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
