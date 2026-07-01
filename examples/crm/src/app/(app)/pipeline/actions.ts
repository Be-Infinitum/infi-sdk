"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  revalidatePath("/pipeline");
}

export async function deleteDeal(id: string) {
  const user = await requireUser();
  await prisma.deal.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/pipeline");
}
