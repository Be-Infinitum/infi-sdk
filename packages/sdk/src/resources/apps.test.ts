import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("infi.apps", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("create POSTs /account/apps with the app config", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app_1", slug: "crm-demo" }, 201));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    const app = await infi.apps.create({
      slug: "crm-demo",
      name: "CRM Demo",
      allowedOrigins: ["http://localhost:3010"],
      redirectUris: ["http://localhost:3010/callback"],
    });

    expect(app).toEqual({ id: "app_1", slug: "crm-demo" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/account/apps`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    expect(JSON.parse(init.body as string)).toEqual({
      slug: "crm-demo",
      name: "CRM Demo",
      allowedOrigins: ["http://localhost:3010"],
      redirectUris: ["http://localhost:3010/callback"],
    });
  });

  it("update PATCHes /account/apps/{id}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app_1" }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    await infi.apps.update("app_1", { redirectUris: ["http://localhost:3010/callback"] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/account/apps/app_1`);
    expect(init.method).toBe("PATCH");
  });

  it("list unwraps the apps array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ apps: [{ id: "app_1" }, { id: "app_2" }] }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    const apps = await infi.apps.list();
    expect(apps).toHaveLength(2);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/account/apps`);
  });

  it("requires a secret key", async () => {
    const infi = new Infi({ apiUrl: BASE }); // no secret key
    await expect(infi.apps.create({ slug: "x", name: "X" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
