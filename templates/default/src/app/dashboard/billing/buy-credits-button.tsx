"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BuyCreditsButton() {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Checkout failed");
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir checkout");
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleCheckout} disabled={loading}>
      {loading ? "Abrindo…" : "Comprar créditos"}
    </Button>
  );
}
