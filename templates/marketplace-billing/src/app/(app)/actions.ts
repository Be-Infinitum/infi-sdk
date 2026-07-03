"use server";

import { revalidatePath } from "next/cache";
import { infi } from "@/lib/infi";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * Close the org's period and bill it: roll the subscription's ended period into an
 * invoice (usage rated at that org's rate-card by the backend), then finalize + email.
 */
export async function closePeriodAndInvoice(externalId: string) {
  await requireOperator();
  const org = await prisma.org.findUnique({ where: { externalId } });
  if (!org) return { ok: false as const, error: "org not found" };

  try {
    const invoice = await infi.invoices.generateFromSubscription(org.subscriptionId);
    if (invoice.id) {
      await infi.invoices.send(invoice.id);
      await prisma.org.update({
        where: { externalId },
        data: { lastInvoiceId: invoice.id },
      });
    }
    revalidatePath("/");
    return { ok: true as const, invoiceId: invoice.id ?? null, total: invoice.total ?? null };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
