import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { Login } from "./login.js";

describe("Login", () => {
  it("redirects to the hosted login with slug + absolute redirect_uri", () => {
    const GET = Login({
      slug: "acme",
      redirectTo: "/api/auth/callback",
      appUrl: "https://auth.example.com",
    });
    const res = GET(new NextRequest("https://app.example.com/api/auth/login"));

    expect([307, 308]).toContain(res.status);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin + loc.pathname).toBe("https://auth.example.com/identity/acme/login");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/auth/callback");
  });

  it("evaluates a state function against the request", () => {
    const GET = Login({
      slug: "acme",
      redirectTo: "/cb",
      appUrl: "https://auth.example.com",
      state: () => "xyz",
    });
    const res = GET(new NextRequest("https://app.example.com/login"));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("state")).toBe("xyz");
  });
});
