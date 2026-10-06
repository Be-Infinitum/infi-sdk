import { NextResponse } from "next/server";
import { getInfi } from "@/lib/infi";

/** The order's state as Infi has it — the only answer the thank-you page trusts. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ paid: false }, { status: 400 });
  try {
    const order = await getInfi().invoices.get(id);
    return NextResponse.json({ paid: order.status === "paid" });
  } catch {
    return NextResponse.json({ paid: false });
  }
}
