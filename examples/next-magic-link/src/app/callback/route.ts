import { Infi, setSessionCookie } from "@infi/sdk";
import { NextRequest, NextResponse } from "next/server";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
});

export async function GET(req: NextRequest) {
  const url = req.url;
  const hasCode = new URL(url).searchParams.has("code");

  const result = hasCode
    ? await infi.exchangeCodeFromRequest({ url })
    : await infi.validateMagicLinkFromRequest({ url });

  const res = NextResponse.json(result);
  if (result.session) {
    setSessionCookie(res, result.session);
  }
  return res;
}
