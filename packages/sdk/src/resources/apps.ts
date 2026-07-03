import type { Transport } from "../http.js";
import type { App, CreateAppRequest, UpdateAppRequest } from "../types.js";

const enc = encodeURIComponent;

/**
 * Apps: register and configure your identity apps (the `slug` end-users log into,
 * plus its `allowedOrigins` / `redirectUris` allowlist). Secret-key only — this is
 * how you provision an app in code instead of the dashboard, so hosted login works.
 *
 * ```ts
 * await infi.apps.create({
 *   slug: "crm-demo",
 *   name: "CRM Demo",
 *   allowedOrigins: ["http://localhost:3010"],
 *   redirectUris: ["http://localhost:3010/callback"],
 * });
 * ```
 */
export class AppsResource {
  constructor(private readonly t: Transport) {}

  /** Register a new app. `slug` must be unique for the tenant. */
  create(input: CreateAppRequest, idempotencyKey?: string): Promise<App> {
    return this.t.request("POST", "/account/apps", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Update an app's name / allowed origins / redirect URIs / session mode. */
  update(appId: string, input: UpdateAppRequest): Promise<App> {
    return this.t.request("PATCH", `/account/apps/${enc(appId)}`, {
      body: input,
      requireSecret: true,
    });
  }

  /** List the tenant's apps. */
  async list(): Promise<App[]> {
    const res = await this.t.request<{ apps?: App[] }>("GET", "/account/apps", {
      requireSecret: true,
    });
    return res.apps ?? [];
  }

  /** Fetch a single app by id. */
  get(appId: string): Promise<App> {
    return this.t.request("GET", `/account/apps/${enc(appId)}`, { requireSecret: true });
  }
}
