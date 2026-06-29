import { Infi, setSessionCookie } from "@infi/sdk";
import { NextRequest, NextResponse } from "next/server";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
});

export async function GET(req: NextRequest) {
  // The hosted flow lands here with a single-use ?code=… — exchange it for a session.
  const result = await infi.exchangeCodeFromRequest({ url: req.url });

  const res = NextResponse.json(result);
  if (result.session) {
    setSessionCookie(res, result.session);
  }
  return res;
}
