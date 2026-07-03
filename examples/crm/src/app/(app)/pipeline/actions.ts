"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { infi, SLUG, PRODUCT_KEY } from "@/lib/infi";

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const valueReais = Number(formData.get("value") ?? 0);
  const contactId = (formData.get("contactId") as string) || null;

  await prisma.deal.create({
    data: {
      ownerId: user.id,
      title,
      valueCents: Number.isFinite(valueReais) ? Math.round(valueReais * 100) : 0,
      stage: (formData.get("stage") as string) || "LEAD",
      contactId: contactId && contactId !== "none" ? contactId : null,
    },
  });
  revalidatePath("/pipeline");
}

export async function moveDeal(id: string, stage: string) {
  const user = await requireUser();
  await prisma.deal.updateMany({ where: { id, ownerId: user.id }, data: { stage } });

  // Deal won → fire a real sale: a hosted checkout for the deal value, billed to
  // the deal's contact. Store the pay link so the card can show "Pagar". Best-effort:
  // never block the pipeline move if checkout fails.
  if (stage === "WON") {
    const deal = await prisma.deal.findFirst({
      where: { id, ownerId: user.id },
      include: { contact: true },
    });
    if (deal && !deal.payUrl && deal.valueCents > 0) {
      try {
        const product = (await infi.products.list()).find((p) => p.key === PRODUCT_KEY);
        if (product?.id) {
          const c = deal.contact;
          const { invoice, url } = await infi.checkout({
            slug: SLUG,
            productId: product.id,
            customer: {
              externalId: c?.email || c?.id || `deal-${deal.id}`,
              email: c?.email ?? undefined,
              name: c?.name ?? deal.title,
            },
            amount: (deal.valueCents / 100).toFixed(2),
            description: deal.title,
            // If the contact has an email, finalize + email the invoice to them
            // (they can pay from the email). Either way we keep `url` for the
            // "Pagar" link on the card. In dev the mailer just logs the email.
            send: Boolean(c?.email),
          });
          await prisma.deal.update({
            where: { id: deal.id },
            data: { payUrl: url, invoiceId: invoice.id ?? null },
          });
        }
      } catch (err) {
        console.error("deal checkout failed:", err instanceof Error ? err.message : err);
      }
    }
  }
  revalidatePath("/pipeline");
}

export async function deleteDeal(id: string) {
  const user = await requireUser();
  await prisma.deal.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/pipeline");
}
