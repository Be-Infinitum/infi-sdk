// Marketplace inventory webhook — a marketplace pushes a batch of inventory changes
// for one org; we apply them and meter one `inventory_update` per change.
//
// Adopting `withMeter`: it gates credit, runs the handler, then records usage from
// the value the handler returns. This billing model is POSTPAID — each org is priced
// by its own rate-card and invoiced at period close, there is no prepaid wallet to
// draw down. So the credit GATE does not apply here: `mode: "postpaid"` keeps the
// usage recording but skips the pre-flight 402 — record, never gate. (Prefer this
// over the older `skipGuard: true`: the intent is self-documenting.)
//
// Metering keys on the org's EXTERNAL id — same discipline as `trackBatch` in
// scripts/ingest.ts — so we resolve it from the `x-org-id` header, NOT from the JSON
// body: `resolveCustomerId` and the handler receive the same request, whose body can
// only be read once, and the handler needs the body.
import { withMeter } from "@beinfi/nextjs";

interface InventoryUpdate {
  sku: string;
  quantity: number;
}

export const POST = withMeter(
  {
    secretKey: process.env.INFI_SECRET_KEY!,
    apiUrl: process.env.INFI_API_URL,
    meter: "inventory_update",
    // External id (as with trackBatch), passed by the marketplace on the header.
    resolveCustomerId: (req) => req.headers.get("x-org-id") ?? undefined,
    // Postpaid rate-card model: nothing to gate on. Record usage, never block.
    mode: "postpaid",
    // Meter the event COUNT: one usage unit per applied inventory change.
    extract: (result) => (result as { applied: number }).applied,
  },
  async (req) => {
    const { updates } = (await req.json()) as { updates: InventoryUpdate[] };
    // "Apply" the changes to our marketplace mirror. In the demo this stands in for
    // the real sync; what we bill on is the number of updates applied.
    const applied = Array.isArray(updates) ? updates.length : 0;
    return { applied, orgId: req.headers.get("x-org-id") };
  },
);
