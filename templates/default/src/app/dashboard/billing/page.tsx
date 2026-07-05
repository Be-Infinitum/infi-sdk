import { UsagePanel } from "@beinfi/sdk/react";
import { requireOnboardedUser } from "@/lib/auth";
import { infi } from "@/lib/infi";
import { BuyCreditsButton } from "./buy-credits-button";

export default async function BillingPage() {
  const user = await requireOnboardedUser();
  const state = await infi.customers.state(user.enrollmentId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plano e uso</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saldo de créditos e consumo no período atual.
          </p>
        </div>
        <BuyCreditsButton />
      </div>

      <div className="mt-6 rounded-lg border p-6">
        <UsagePanel state={state} creditLabel="créditos" />
      </div>
    </div>
  );
}
