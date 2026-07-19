import { NextResponse } from "next/server";
import { getSession } from "@beinfi/nextjs";
import { infi, SLUG, productId } from "@/lib/infi";
import { prisma } from "@/lib/db";

export async function POST() {
  const session = await getSession({
    secretKey: process.env.INFI_SECRET_KEY!,
    apiUrl: process.env.INFI_API_URL,
  });
  if (!session?.customer?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const customerId = session.customer.id;
  const profile = await prisma.userProfile.findUnique({ where: { id: customerId } });
  if (!profile?.enrollmentId) {
    return NextResponse.json({ error: "not_enrolled" }, { status: 400 });
  }

  const pid = await productId();
  const email = session.customer.email ?? session.identity?.email ?? undefined;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? `http://localhost:__PORT__`;

  const { invoice, url } = await infi.checkout({
    slug: SLUG,
    productId: pid,
    customer: { externalId: customerId, email },
    successUrl: `${origin}/dashboard/billing`,
  });

  if (invoice.id) {
    await prisma.purchase.upsert({
      where: { invoiceId: invoice.id },
      create: {
        invoiceId: invoice.id,
        enrollmentId: profile.enrollmentId,
        customerId,
      },
      update: {},
    });
  }

  return NextResponse.json({ url });
}
