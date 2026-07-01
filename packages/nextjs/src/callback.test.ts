import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Callback } from "./callback.js";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

describe("Callback", () => {
  it("exchanges the code, sets the session cookie, and redirects to successUrl", async () => {
    stubFetch({ identity: { email: "a@b.com" }, session: { token: "sess_123", expiresAt: null } });

    const GET = Callback({ secretKey: "sk_test_x", successUrl: "/dashboard" });
    const res = await GET(new NextRequest("https://app.example.com/api/auth/callback?code=abc"));

    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/dashboard");
    expect(res.headers.get("set-cookie") ?? "").toContain("infi_session=sess_123");
  });

  it("returns a 400 JSON error when the auth code is missing", async () => {
    const GET = Callback({ secretKey: "sk_test_x", successUrl: "/dashboard" });
    const res = await GET(new NextRequest("https://app.example.com/api/auth/callback"));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toMatch(/auth code/i);
  });

  it("routes a failed exchange through onError", async () => {
    stubFetch({ error: { message: "bad code" } }, 401);

    const onError = vi.fn(() => NextResponse.json({ custom: true }, { status: 418 }));
    const GET = Callback({ secretKey: "sk_test_x", successUrl: "/dashboard", onError });
    const res = await GET(new NextRequest("https://app.example.com/api/auth/callback?code=bad"));

    expect(onError).toHaveBeenCalledOnce();
    expect(res.status).toBe(418);
  });
});
