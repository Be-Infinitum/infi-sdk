import { cookies } from "next/headers";
import { PortalElement } from "@/components/infi/portal-element";
import { environment, tenantSlug } from "@/lib/infi";

export const dynamic = "force-dynamic";

/**
 * "Minhas compras": the buyer logs in inside the Infi frame with a 6-digit
 * code; the token comes back here and is kept in a first-party, httpOnly
 * cookie for 30 days, handed back to the frame on every visit.
 */
export default async function PortalPage() {
  const token = (await cookies()).get("infi_bt")?.value ?? null;
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Minhas compras</h1>
      <div className="mt-8">
        <PortalElement slug={tenantSlug()} mode={environment() === "production" ? "live" : "sandbox"} initialToken={token} />
      </div>
    </main>
  );
}
