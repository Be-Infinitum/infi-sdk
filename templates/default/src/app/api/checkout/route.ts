import { NextResponse } from "next/server";
import { getSession } from "@beinfi/nextjs";
import { infi, SLUG, productId } from "@/lib/infi";

export async function POST() {
  const session = await getSession({
    secretKey: process.env.INFI_SECRET_KEY!,
    baseUrl: process.env.INFI_API_URL,
  });
  if (!session?.customer?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pid = await productId();
  const email = session.customer.email ?? session.identity?.email ?? undefined;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? `http://localhost:__PORT__`;

  const { url } = await infi.checkout({
    slug: SLUG,
    productId: pid,
    customer: { externalId: session.customer.id, email },
    successUrl: `${origin}/dashboard/billing`,
  });

  return NextResponse.json({ url });
}
