import { infi } from "@/lib/infi";
import { prisma } from "@/lib/db";
import { METERS } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClosePeriodButton } from "./close-period-button";
import { UsagePanel } from "@beinfi/sdk/react";
import type { CustomerState, Invoice, RateCard, UsageReport } from "@beinfi/sdk";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function money(v?: string | null) {
  return v == null ? "—" : brl.format(Number(v));
}

const meterLabel = (key: string) =>
  METERS.find((m) => m.key === key)?.displayName ?? key;

export default async function DashboardPage() {
  const orgs = await prisma.org.findMany({ orderBy: { createdAt: "asc" } });

  // Per org: usage totals (server-rated), the rate-card, and the last invoice (if any).
  const data = await Promise.all(
    orgs.map(async (org) => {
      const [usage, rateCards, invoice, state] = await Promise.all([
        infi.usage.get({
          customerId: org.enrollmentId,
          from: org.periodStart.toISOString(),
          to: org.periodEnd.toISOString(),
        }) as Promise<UsageReport>,
        infi.customers.rateCards.list(org.enrollmentId) as Promise<RateCard[]>,
        org.lastInvoiceId
          ? (infi.invoices.get(org.lastInvoiceId) as Promise<Invoice>)
          : Promise.resolve(null),
        // One-read customer view (enrollment + credit + subscriptions + usage) that
        // backs the drop-in <UsagePanel/>. Keyed on the ENROLLMENT id, like usage.get.
        // This demo's usage lives in a backdated period, so pass that window (state
        // defaults to the live period, which would read zero here).
        infi.customers.state(org.enrollmentId, {
          from: org.periodStart.toISOString(),
          to: org.periodEnd.toISOString(),
        }) as Promise<CustomerState>,
      ]);
      const rateByMeter = new Map(rateCards.map((r) => [r.meterId ?? "", r.unitAmount]));
      const projected = usage.meters.reduce((sum, m) => sum + Number(m.totalAmount ?? 0), 0);
      return { org, usage, rateByMeter, projected, invoice, state };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Uso e cobrança por organização</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mesmo volume de eventos, preço por organização (rate-card). A fatura de cada org difere
          pela diferença de preço, não de uso.
        </p>
      </div>

      {data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma organização. Rode <code>bun run seed</code> e <code>bun run ingest</code>.
          </CardContent>
        </Card>
      )}

      {data.map(({ org, usage, rateByMeter, projected, invoice, state }) => (
        <Card key={org.externalId}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {org.name}
                <Badge variant={org.tier === "premium" ? "default" : "secondary"}>{org.tier}</Badge>
              </CardTitle>
              <CardDescription>
                Período {org.periodStart.toLocaleDateString("pt-BR")} –{" "}
                {org.periodEnd.toLocaleDateString("pt-BR")}
              </CardDescription>
            </div>
            <ClosePeriodButton externalId={org.externalId} />
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Preço/un (rate-card)</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.meters.map((m) => (
                  <TableRow key={m.meterId}>
                    <TableCell>{meterLabel(m.meter)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.totalValue}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(rateByMeter.get(m.meterId))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(m.totalAmount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    Projetado no período
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {money(String(projected))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {invoice && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">
                    Fatura {invoice.invoiceNumber ?? invoice.id?.slice(0, 8)}
                  </span>
                  <Badge variant="outline">{invoice.status}</Badge>
                </div>
                <ul className="space-y-1">
                  {(invoice.lineItems ?? []).map((li) => (
                    <li key={li.id} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{li.description}</span>
                      <span>{money(li.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t pt-2 font-semibold tabular-nums">
                  <span>Total</span>
                  <span>{money(invoice.total)}</span>
                </div>
              </div>
            )}

            {/* Drop-in SDK panel over the same customer state, fetched for the demo's
                backdated period so per-meter usage + rated cost show real numbers.
                These orgs are postpaid rate-card, not prepaid, so `hideCredit` drops
                the (empty) wallet row cleanly. See FINDINGS. */}
            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                UsagePanel (@beinfi/sdk/react)
              </div>
              <UsagePanel state={state} hideCredit />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
