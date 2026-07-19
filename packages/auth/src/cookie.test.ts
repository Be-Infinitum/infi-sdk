import { describe, expect, it } from "vitest";
import { readSessionToken, sessionCookieHeader } from "./cookie.js";

describe("cookie helpers", () => {
  it("reads infi_session from Cookie header", () => {
    const req = new Request("http://localhost/", {
      headers: { cookie: "other=1; infi_session=abc%20123; foo=bar" },
    });
    expect(readSessionToken(req)).toBe("abc 123");
  });

  it("builds Set-Cookie header", () => {
    const header = sessionCookieHeader("tok", { secure: false });
    expect(header).toContain("infi_session=tok");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });
});
