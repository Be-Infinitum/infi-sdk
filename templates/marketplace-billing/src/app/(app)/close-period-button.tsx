"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closePeriodAndInvoice } from "./actions";

export function ClosePeriodButton({ externalId }: { externalId: string }) {
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await closePeriodAndInvoice(externalId);
          if (res.ok) toast.success(`Fatura gerada${res.total ? ` — total ${res.total}` : ""}`);
          else toast.error(`Falha ao faturar: ${res.error}`);
        })
      }
    >
      {pending ? "Faturando…" : "Fechar período e faturar"}
    </Button>
  );
}
