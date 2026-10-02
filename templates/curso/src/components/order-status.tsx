"use client";

import { useEffect, useState } from "react";

/**
 * C10: ask the server for up to 60 s, then say the e-mail is on its way.
 * A slow confirmation must never read as a failure — pix settles in seconds
 * most of the time, not always.
 */
export function OrderStatus({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"waiting" | "paid" | "email">("waiting");
  useEffect(() => {
    const started = Date.now();
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch(`/api/pedido?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const body = (await res.json()) as { paid?: boolean };
        if (body.paid) return setState("paid");
      } catch {
        // keep asking until the deadline
      }
      if (Date.now() - started > 60_000) return setState("email");
      setTimeout(tick, 3000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [orderId]);
  if (state === "paid") return <p className="mt-4">Pagamento confirmado. O acesso chegou no seu e-mail.</p>;
  if (state === "email") {
    return <p className="mt-4">Estamos confirmando o pagamento. Você vai receber um e-mail assim que ele cair.</p>;
  }
  return <p className="mt-4 text-muted-foreground">Confirmando o pagamento…</p>;
}
