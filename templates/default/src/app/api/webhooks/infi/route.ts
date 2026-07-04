import { NextResponse, type NextRequest } from "next/server";
import { infi, PACK_CREDITS } from "@/lib/infi";
import { prisma } from "@/lib/db";

/** Grant prepaid credits when hosted checkout confirms payment. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const secret = process.env.INFI_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  let event;
  try {
    event = infi.verifyWebhook(
      {
        id: req.headers.get("x-webhook-id") ?? "",
        eventType: req.headers.get("x-webhook-event-type") ?? "",
        timestamp: req.headers.get("x-webhook-timestamp") ?? "",
        signature: req.headers.get("x-webhook-signature") ?? "",
        body,
      },
      secret,
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "payment.confirmed") {
    const data = event.data as { invoiceId?: string };
    if (data.invoiceId) {
      const purchase = await prisma.purchase.findUnique({ where: { invoiceId: data.invoiceId } });
      if (purchase) {
        await infi.customers.credits
          .grant(purchase.enrollmentId, { amount: PACK_CREDITS, reference: data.invoiceId })
          .catch(() => {});
      }
    }
  }

  return NextResponse.json({ received: true });
}
