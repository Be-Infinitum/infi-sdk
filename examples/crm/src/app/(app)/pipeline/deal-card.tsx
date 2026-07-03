"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteDeal, moveDeal } from "./actions";

const STAGE_LABEL: Record<string, string> = {
  LEAD: "Lead",
  CONTACTED: "Contato",
  PROPOSAL: "Proposta",
  WON: "Ganho",
  LOST: "Perdido",
};

export function DealCard({
  id,
  title,
  value,
  stage,
  stages,
  payUrl,
}: {
  id: string;
  title: string;
  value: string;
  stage: string;
  stages: string[];
  payUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border bg-background p-3 shadow-sm" data-pending={pending}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{title}</p>
        <button
          type="button"
          aria-label="Excluir"
          className="text-muted-foreground transition hover:text-destructive"
          onClick={() => startTransition(() => deleteDeal(id))}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{value}</p>
      <Select value={stage} onValueChange={(s) => startTransition(() => moveDeal(id, s))}>
        <SelectTrigger className="mt-2 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STAGE_LABEL[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {payUrl ? (
        <a
          href={payUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block rounded-md bg-foreground px-2 py-1.5 text-center text-xs font-medium text-background transition hover:opacity-90"
        >
          Pagar
        </a>
      ) : null}
    </div>
  );
}
