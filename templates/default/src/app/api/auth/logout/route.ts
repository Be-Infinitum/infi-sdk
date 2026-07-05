import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "infi_session";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
