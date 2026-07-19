"use server";

import { revalidatePath } from "next/cache";
import { meterAction } from "@beinfi/nextjs";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Ingest a lead. CRM charges per lead ingested (usage/postpaid), so this is
 * wrapped with `meterAction` in `mode: "postpaid"`: it runs the create and
 * records one `leads_ingested` unit, but never gates — billing stays off the
 * critical path, so a lead is never lost to an empty wallet. The wrapper returns
 * the created contact unchanged, so the client gets it back for optimistic UI.
 */
export async function createContact(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;

  const ingest = meterAction(
    {
      secretKey: process.env.INFI_SECRET_KEY!,
      apiUrl: process.env.INFI_API_URL,
      meter: "leads_ingested",
      customerId: user.id,
      mode: "postpaid",
      value: 1,
    },
    () =>
      prisma.contact.create({
        data: {
          ownerId: user.id,
          name,
          email: (formData.get("email") as string)?.trim() || null,
          company: (formData.get("company") as string)?.trim() || null,
          status: (formData.get("status") as string) || "LEAD",
          source: (formData.get("source") as string)?.trim() || null,
        },
      }),
  );

  const contact = await ingest();
  revalidatePath("/contacts");
  return contact;
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
