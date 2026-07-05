import type { Transport } from "../http.js";
import type { ApiKey, CreatedApiKey } from "../types.js";

export type CreateApiKeyInput = {
  tier?: "free" | "pro" | "enterprise";
  scopes?: string[];
  kind?: "secret" | "publishable";
};

/**
 * Tenant API keys — list, create, revoke. Secret keys are shown only at creation.
 */
export class ApiKeysResource {
  constructor(private readonly t: Transport) {}

  async list(): Promise<ApiKey[]> {
    const res = await this.t.request<{ apiKeys?: ApiKey[] }>("GET", "/account/api-keys", {
      requireSecret: true,
    });
    return res.apiKeys ?? [];
  }

  create(input: CreateApiKeyInput = {}, idempotencyKey?: string): Promise<CreatedApiKey> {
    return this.t.request("POST", "/account/api-keys", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  revoke(keyId: string, idempotencyKey?: string): Promise<ApiKey> {
    return this.t.request("DELETE", `/account/api-keys/${encodeURIComponent(keyId)}`, {
      requireSecret: true,
      idempotencyKey,
    });
  }
}
