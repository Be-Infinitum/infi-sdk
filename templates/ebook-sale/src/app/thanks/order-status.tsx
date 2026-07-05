"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type OrderState = { status: string; downloadUrl: string | null; checkoutUrl: string | null };

export function OrderStatus({ invoiceId }: { invoiceId: string }) {
  const [order, setOrder] = useState<OrderState | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      const res = await fetch(`/api/orders?invoice=${encodeURIComponent(invoiceId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as OrderState;
      if (alive) setOrder(data);
      return data.status;
    }
    poll();
    const iv = setInterval(async () => {
      const status = await poll();
      if (status === "paid") clearInterval(iv);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [invoiceId]);

  if (order?.status === "paid") {
    return (
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pagamento confirmado 🎉</h1>
        <p className="mt-2 text-muted-foreground">Seu ebook está pronto.</p>
        {order.downloadUrl ? (
          <Button asChild size="lg" className="mt-6">
            <a href={order.downloadUrl}>
              <Download className="size-4" /> Baixar ebook
            </a>
          </Button>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Preparando seu link…</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Quase lá</h1>
      <p className="mt-2 text-muted-foreground">Conclua o pagamento para receber o ebook.</p>
      {order?.checkoutUrl ? (
        <Button asChild size="lg" className="mt-6">
          <a href={order.checkoutUrl}>Pagar agora</a>
        </Button>
      ) : null}
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Aguardando confirmação…
      </p>
    </div>
  );
}
