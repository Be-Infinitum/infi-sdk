import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NewDealDialog } from "./new-deal-dialog";
import { DealCard } from "./deal-card";

const STAGES = ["LEAD", "CONTACTED", "PROPOSAL", "WON", "LOST"] as const;
const STAGE_LABEL: Record<string, string> = {
  LEAD: "Lead",
  CONTACTED: "Contato",
  PROPOSAL: "Proposta",
  WON: "Ganho",
  LOST: "Perdido",
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export default async function PipelinePage() {
  const user = await requireUser();
  const [deals, contacts] = await Promise.all([
    prisma.deal.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.contact.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <NewDealDialog contacts={contacts} stages={STAGES as unknown as string[]} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const inStage = deals.filter((d) => d.stage === stage);
          const total = inStage.reduce((sum, d) => sum + d.valueCents, 0);
          return (
            <div key={stage} className="flex flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{STAGE_LABEL[stage]}</span>
                <span className="text-xs text-muted-foreground">{brl.format(total / 100)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {inStage.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">Vazio</p>
                ) : (
                  inStage.map((d) => (
                    <DealCard
                      key={d.id}
                      id={d.id}
                      title={d.title}
                      value={brl.format(d.valueCents / 100)}
                      stage={d.stage}
                      stages={STAGES as unknown as string[]}
                      payUrl={d.payUrl}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
