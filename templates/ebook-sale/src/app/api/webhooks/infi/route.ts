import { NextResponse, type NextRequest } from "next/server";
import { infi } from "@/lib/infi";
import { fulfillByWebhook } from "@/lib/fulfill";

/** Real fulfillment path: verify the signed webhook, deliver on invoice.paid. */
export async function POST(req: NextRequest) {
  const body = await req.text(); // raw body — required for signature verification
  const id = req.headers.get("x-webhook-id") ?? "";
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const eventType = req.headers.get("x-webhook-event-type") ?? "";

  let event;
  try {
    event = infi.verifyWebhook({ id, eventType, timestamp, signature, body }, process.env.INFI_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // payment.confirmed marks the invoice paid (there is no invoice.paid event).
  if (event.type === "payment.confirmed") {
    const data = event.data as { invoiceId?: string };
    if (data.invoiceId) await fulfillByWebhook(data.invoiceId);
  }

  return NextResponse.json({ received: true });
}
