import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackElement, InfiProvider, InfiSignals, useSignals } from "./index.js";

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[];

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  calls = [];
  // Node's own localStorage shadows the DOM's in happy-dom.
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: memoryStorage(), configurable: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ id: "f1" }), { status: 201 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Track() {
  const signals = useSignals();
  return (
    <button type="button" onClick={() => signals.track("plan_compared", { plan: "pro" })}>
      comparar
    </button>
  );
}

function Site({ children, publishableKey = "pk_test_x" }: { children: React.ReactNode; publishableKey?: string }) {
  return (
    <InfiProvider slug="loja" environment="sandbox" publishableKey={publishableKey}>
      <InfiSignals apiUrl="https://api.test" externalId="cliente-1" />
      {children}
    </InfiProvider>
  );
}

describe("InfiSignals", () => {
  it("sends the merchant's own events with the visitor", async () => {
    render(
      <Site>
        <Track />
      </Site>,
    );
    fireEvent.click(screen.getByText("comparar"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/public/signals/events"))).toBe(true));
    const batch = calls.find((c) => c.url.endsWith("/events"))!.body;
    expect(batch.externalId).toBe("cliente-1");
    expect(batch.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "custom", name: "plan_compared", properties: { plan: "pro" } })]),
    );
  });

  it("is a no-op without a publishable key", () => {
    render(
      <InfiProvider slug="loja" environment="sandbox">
        <InfiSignals />
        <Track />
      </InfiProvider>,
    );
    fireEvent.click(screen.getByText("comparar"));
    expect(calls).toHaveLength(0);
  });
});

describe("FeedbackElement", () => {
  it("sends a reaction and a message, and thanks the visitor", async () => {
    render(
      <Site>
        <FeedbackElement locale="pt-BR" />
      </Site>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    fireEvent.click(screen.getByRole("radio", { name: "Amei" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "muito bom" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Obrigado! Recebemos sua mensagem.")).toBeTruthy();
    const sent = calls.find((c) => c.url.endsWith("/public/signals/feedback"))!.body;
    expect(sent).toMatchObject({ reaction: "love", message: "muito bom", externalId: "cliente-1" });
  });

  it("sends nothing in preview", () => {
    render(
      <Site>
        <FeedbackElement locale="en" inline preview />
      </Site>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Love it" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(calls.filter((c) => c.url.endsWith("/feedback"))).toHaveLength(0);
  });
});
