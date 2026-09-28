import { describe, expect, it, vi } from "vitest";
import { createPortalClient, PortalError } from "./portal.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("portal client", () => {
  it("logs in by code and reads with the token it got", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const answers = [json({ challengeId: "c1", expiresAt: "t" }, 202), json({ token: "bt_1", expiresAt: "t", origin: "code", scope: "portal:read" }, 201), json({ orders: [] })];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const onToken = vi.fn();
    const portal = createPortalClient({ apiUrl: "https://api.test/", slug: "loja", fetchImpl, onToken });
    const { challengeId } = await portal.login("a@b.c");
    await portal.verify(challengeId, "123456");
    expect(onToken).toHaveBeenCalledWith("bt_1");
    expect(await portal.orders()).toEqual([]);
    expect(calls[0]!.url).toBe("https://api.test/pay/loja/portal/login");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect((calls[2]!.init.headers as Record<string, string>).Authorization).toBe("Bearer bt_1");
  });

  it("renews through getToken after a 401 and retries a write with the SAME idempotency key", async () => {
    const keys: string[] = [];
    const answers = [json({ error_code: "buyer_token_invalid", message: "ended" }, 401), json({ id: "s1", cancelAtPeriodEnd: true })];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const getToken = vi.fn(async () => "bt_fresh");
    const portal = createPortalClient({ apiUrl: "https://api.test", slug: "loja", token: "bt_old", getToken, fetchImpl });
    const sub = await portal.cancelSubscription("s1");
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("sends the fresh-code grant on a sensitive action and surfaces the API code on refusal", async () => {
    let grantHeader: string | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      grantHeader = (init.headers as Record<string, string>)["X-Buyer-Action-Grant"];
      return json({ error_code: "fresh_code_required", message: "Confirm with a new code." }, 403);
    }) as unknown as typeof fetch;
    const portal = createPortalClient({ apiUrl: "https://api.test", slug: "loja", token: "bt_1", fetchImpl });
    await expect(portal.requestRefund("o1", { grant: "bag_x" })).rejects.toMatchObject({
      status: 403,
      code: "fresh_code_required",
    });
    expect(grantHeader).toBe("bag_x");
    await expect(portal.requestRefund("o1")).rejects.toBeInstanceOf(PortalError);
  });

  it("shares one getToken among concurrent reads", async () => {
    let resolve!: (t: string) => void;
    const getToken = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const fetchImpl = vi.fn(async () => json({ downloads: [] })) as unknown as typeof fetch;
    const portal = createPortalClient({ apiUrl: "https://api.test", slug: "loja", getToken, fetchImpl });
    const both = Promise.all([portal.downloads(), portal.downloads()]);
    resolve("bt_1");
    await both;
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("reads a lesson and unmarks it with DELETE, carrying an idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const answers = [
      json({ id: "l1", state: "locked", unlocksAt: "2026-10-05T00:00:00Z", hasVideo: true, hasText: false, completed: false }),
      json({ id: "c1", progress: { completed: 0, total: 2, percent: 0 }, continue: { lessonId: "l0" } }),
    ];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const portal = createPortalClient({ apiUrl: "https://api.test", slug: "loja", token: "bt_1", fetchImpl });
    const lesson = await portal.lesson("c1", "l1");
    expect(lesson.state).toBe("locked");
    expect(lesson.video).toBeUndefined();
    const course = await portal.uncompleteLesson("c1", "l0");
    expect(course.continue?.lessonId).toBe("l0");
    expect(calls[0]!.url).toBe("https://api.test/pay/loja/portal/courses/c1/lessons/l1");
    expect(calls[1]!.init.method).toBe("DELETE");
    expect((calls[1]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("surfaces an unknown access key as a 404, not as no access", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error_code: "access_key_not_found", message: "The access key was not found." }, 404),
    ) as unknown as typeof fetch;
    const portal = createPortalClient({ apiUrl: "https://api.test", slug: "loja", token: "bt_1", fetchImpl });
    await expect(portal.accessKey("typo")).rejects.toMatchObject({ status: 404, code: "access_key_not_found" });
  });
});
