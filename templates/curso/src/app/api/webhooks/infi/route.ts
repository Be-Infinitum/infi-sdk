import { NextResponse } from "next/server";
import { getInfi } from "@/lib/infi";

/**
 * Signed events from Infi (`infi deploy --url` registers this endpoint and
 * writes INFI_WEBHOOK_SECRET). The digital file itself is mailed by Infi; put
 * here whatever YOUR site does when a payment confirms (unlock an area, notify
 * a team, …). Never deliver from the browser's onComplete.
 */
export async function POST(req: Request) {
  const secret = process.env.INFI_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const body = await req.text();
  let event;
  try {
    event = getInfi().verifyWebhook(
      {
        id: req.headers.get("x-webhook-id") ?? "",
        timestamp: req.headers.get("x-webhook-timestamp") ?? "",
        signature: req.headers.get("x-webhook-signature") ?? "",
        eventType: req.headers.get("x-webhook-event-type") ?? "",
        body,
      },
      secret,
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  switch (event.type) {
    case "payment.confirmed":
    case "payment.refunded":
    case "subscription.canceled":
    case "refund_request.created":
    case "payment.duplicate_refunded":
      console.info(`infi: ${event.type}`, event.id);
      break;
  }
  return NextResponse.json({ received: true });
}
