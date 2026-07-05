import { infi } from "./infi";
import { prisma } from "./db";

async function deliver(invoiceId: string, productId: string) {
  let downloadUrl: string | null = null;
  try {
    const d = await infi.products.deliverable.get(productId);
    downloadUrl = d.url ?? null;
  } catch {
    // deliverable not set / not a link — leave null
  }
  return prisma.order.update({
    where: { invoiceId },
    data: { status: "paid", downloadUrl },
  });
}

/** Poll path: check the invoice; if paid, deliver. Safe to call repeatedly. */
export async function reconcileOrder(invoiceId: string) {
  const order = await prisma.order.findUnique({ where: { invoiceId } });
  if (!order || order.status === "paid") return order;

  const invoice = await infi.invoices.get(invoiceId);
  if (invoice.status === "paid") return deliver(invoiceId, order.productId);
  return order;
}

/** Webhook path: invoice.paid fired — deliver now. */
export async function fulfillByWebhook(invoiceId: string) {
  const order = await prisma.order.findUnique({ where: { invoiceId } });
  if (!order || order.status === "paid") return;
  await deliver(invoiceId, order.productId);
}
