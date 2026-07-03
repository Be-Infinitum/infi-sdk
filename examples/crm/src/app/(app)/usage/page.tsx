import { UsagePanel } from "@beinfi/sdk/react";
import { requireUser } from "@/lib/auth";
import { infi } from "@/lib/infi";

/**
 * Billing / usage view. `infi.customers.state(id)` returns the whole picture
 * (enrollment + credit balance + subscriptions + current-period usage) in one
 * server-side read; `UsagePanel` renders it. It's presentational (no fetching,
 * no hooks), so it drops straight into this server component.
 */
export default async function UsagePage() {
  const user = await requireUser();
  const state = await infi.customers.state(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Uso e faturamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saldo de créditos e leads medidos no período{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">meter: leads_ingested</code>.
        </p>
      </div>

      <div className="mt-6 rounded-lg border p-6">
        <UsagePanel state={state} creditLabel="créditos" />
      </div>
    </div>
  );
}
