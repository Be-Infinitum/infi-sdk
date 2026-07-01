"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { infi } from "@/lib/infi";

export async function createContact(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.contact.create({
    data: {
      ownerId: user.id,
      name,
      email: (formData.get("email") as string)?.trim() || null,
      company: (formData.get("company") as string)?.trim() || null,
      status: (formData.get("status") as string) || "LEAD",
      source: (formData.get("source") as string)?.trim() || null,
    },
  });

  // Metering: bill by leads ingested. Fire-and-forget — never block the write on
  // billing (metering off the critical path). See FINDINGS.md.
  infi
    .track({ customerId: user.id, meter: "leads_ingested", value: "1" })
    .catch((e) => console.error("[infi] track failed:", e));

  revalidatePath("/contacts");
}

export async function updateContactStatus(id: string, status: string) {
  const user = await requireUser();
  await prisma.contact.updateMany({ where: { id, ownerId: user.id }, data: { status } });
  revalidatePath("/contacts");
}

export async function deleteContact(id: string) {
  const user = await requireUser();
  await prisma.contact.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/contacts");
}
