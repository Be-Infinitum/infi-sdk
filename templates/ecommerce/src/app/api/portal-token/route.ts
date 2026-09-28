import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "infi_bt";

/** Keeps the portal token first-party, httpOnly, for as long as Infi says it lives (≤ 30 days). */
export async function POST(req: Request) {
  const { token, expiresAt } = (await req.json()) as { token?: string; expiresAt?: string };
  if (!token?.startsWith("bt_")) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  const expires = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 86_400_000);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/minhas-compras",
    expires,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete({ name: COOKIE, path: "/minhas-compras" });
  return NextResponse.json({ ok: true });
}
