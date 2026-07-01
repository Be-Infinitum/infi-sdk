import { NextResponse, type NextRequest } from "next/server";
import { reconcileOrder } from "@/lib/fulfill";

export async function GET(req: NextRequest) {
  const invoiceId = req.nextUrl.searchParams.get("invoice");
  if (!invoiceId) return NextResponse.json({ error: "invoice required" }, { status: 400 });

  const order = await reconcileOrder(invoiceId);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    status: order.status,
    downloadUrl: order.downloadUrl,
    checkoutUrl: order.checkoutUrl,
  });
}
