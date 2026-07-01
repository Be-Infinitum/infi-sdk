import { redirect } from "next/navigation";
import { getSession } from "@beinfi/nextjs";
import { prisma } from "./db";
import type { CrmUser } from "@prisma/client";

/**
 * Resolve the signed-in operator from the infi_session cookie.
 *
 * `getSession` (from @beinfi/nextjs) reads the cookie and resolves it to the
 * identity + customer via the SDK — no local Session table, no onAuth wiring.
 * We just lazily upsert the CrmUser row so contacts/deals have an owner to FK to.
 */
export async function getCurrentUser(): Promise<CrmUser | null> {
  const session = await getSession({
    secretKey: process.env.INFI_SECRET_KEY!,
    baseUrl: process.env.INFI_API_URL,
  });
  if (!session?.customer?.id) return null;
  const customerId = session.customer.id;
  const email = session.customer.email ?? session.identity?.email ?? null;

  return prisma.crmUser.upsert({
    where: { id: customerId },
    create: { id: customerId, email },
    update: { email: email ?? undefined },
  });
}

export async function requireUser(): Promise<CrmUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
