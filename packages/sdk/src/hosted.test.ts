import { describe, expect, it } from "vitest";
import {
  buildHostedLoginUrl,
  extractCodeFromUrl,
  extractTokenFromUrl,
} from "./hosted.js";

describe("buildHostedLoginUrl", () => {
  it("builds auth login URL with redirect_uri and state", () => {
    const url = buildHostedLoginUrl({
      slug: "acme",
      redirectTo: "http://localhost:3009/callback",
      state: "abc",
      appUrl: "http://localhost:8088",
    });
    expect(url).toBe(
      "http://localhost:8088/identity/acme/login?redirect_uri=http%3A%2F%2Flocalhost%3A3009%2Fcallback&state=abc",
    );
  });
});

describe("extractTokenFromUrl", () => {
  it("reads token query param", () => {
    expect(extractTokenFromUrl("/callback?token=abc123")).toBe("abc123");
  });
});

describe("extractCodeFromUrl", () => {
  it("reads code query param", () => {
    expect(
      extractCodeFromUrl("http://localhost:3009/callback?code=xyz&state=abc"),
    ).toBe("xyz");
  });
});
