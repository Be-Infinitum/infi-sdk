import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { browserLogin, deviceLogin, loginUrl, pkcePair, prefersDeviceCode } from "./cli-auth.js";

const project = { projectId: "proj_abc", projectName: "loja-cafe", machine: "mac" };
const token = {
  email: "a@b.c",
  tenant: { id: "t", slug: "loja", name: "Loja" },
  apiKey: { id: "k", prefix: "sk_test", lastFour: "abcd", secret: "sk_test_x", reused: false },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("pkce", () => {
  it("makes an S256 challenge of its verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("browser login", () => {
  it("sends the dashboard the challenge and a loopback redirect, and trades the code with the verifier", async () => {
    let exchanged: any;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      exchanged = JSON.parse(String(init.body));
      return json(token, 201);
    }) as unknown as typeof fetch;
    const res = await browserLogin({
      apiBase: "https://api.test",
      appBase: "https://app.test",
      project,
      fetchImpl,
      // Plays the dashboard: approve and send the browser to the listener.
      open: (url) => {
        const u = new URL(url);
        expect(u.pathname).toBe("/cli/login");
        expect(u.searchParams.get("code_challenge_method")).toBe("S256");
        expect(u.searchParams.get("project_id")).toBe("proj_abc");
        const redirect = new URL(u.searchParams.get("redirect_uri")!);
        expect(redirect.hostname).toBe("127.0.0.1");
        redirect.searchParams.set("code", "the-code");
        redirect.searchParams.set("state", u.searchParams.get("state")!);
        void fetch(redirect);
      },
    });
    expect(res.apiKey.secret).toBe("sk_test_x");
    expect(exchanged.code).toBe("the-code");
    expect(exchanged.codeVerifier).toBeTruthy();
  });

  it("marks a live login so the dashboard asks for a step-up", () => {
    const url = loginUrl("https://app.test", { state: "s", challenge: "c", redirectUri: "http://127.0.0.1:1/callback", project, live: true });
    expect(new URL(url).searchParams.get("mode")).toBe("live");
  });
});

describe("device login", () => {
  it("polls through pending and slow_down until approved", async () => {
    const answers = [
      json({ deviceCode: "dc", userCode: "BCDF-GHJK", verificationUri: "u", verificationUriComplete: "u?c", expiresIn: 600, interval: 5 }, 201),
      json({ error_code: "authorization_pending", message: "wait" }, 400),
      json({ error_code: "slow_down", message: "slow" }, 400),
      json(token, 201),
    ];
    const fetchImpl = vi.fn(async () => answers.shift()!) as unknown as typeof fetch;
    const waits: number[] = [];
    const shown = vi.fn();
    const res = await deviceLogin({
      apiBase: "https://api.test",
      project,
      onCode: shown,
      fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ userCode: "BCDF-GHJK" }));
    expect(res.apiKey.secret).toBe("sk_test_x");
    expect(waits).toEqual([5000, 5000, 10000]);
  });

  it("stops on a denied login", async () => {
    const answers = [
      json({ deviceCode: "dc", userCode: "X", verificationUri: "u", verificationUriComplete: "u", expiresIn: 600, interval: 1 }, 201),
      json({ error_code: "access_denied", message: "denied" }, 400),
    ];
    const fetchImpl = vi.fn(async () => answers.shift()!) as unknown as typeof fetch;
    await expect(
      deviceLogin({ apiBase: "https://api.test", project, onCode: () => {}, fetchImpl, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: "access_denied" });
  });
});

describe("prefersDeviceCode", () => {
  it("uses the device code for agents and headless shells", () => {
    expect(prefersDeviceCode({ CLAUDECODE: "1" }, true)).toBe(true);
    expect(prefersDeviceCode({}, false)).toBe(true);
    expect(prefersDeviceCode({}, true)).toBe(false);
  });
});
