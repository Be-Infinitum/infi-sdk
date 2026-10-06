import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/member";

/**
 * Keeps the student's token first-party, httpOnly, for as long as Infi says it
 * lives (≤ 30 days). Path "/": the member area, the course and lesson pages
 * all read it on the server.
 */
export async function POST(req: Request) {
  const { token, expiresAt } = (await req.json()) as { token?: string; expiresAt?: string };
  if (!token?.startsWith("bt_")) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  const expires = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 86_400_000);
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete({ name: TOKEN_COOKIE, path: "/" });
  return NextResponse.json({ ok: true });
}
