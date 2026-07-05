import type { Transport } from "../http.js";
import type { WebhookDelivery, WebhookEndpoint } from "../types.js";

export type CreatedWebhookEndpoint = WebhookEndpoint & {
  /** HMAC signing secret — returned only once at creation. */
  secret?: string;
};

export type CreateWebhookInput = {
  url: string;
  events: string[];
};

export type PatchWebhookInput = {
  isActive?: boolean;
  events?: string[];
};

/**
 * Webhook endpoints — register delivery URLs for payment and invoice events.
 */
export class WebhooksResource {
  constructor(private readonly t: Transport) {}

  async list(): Promise<WebhookEndpoint[]> {
    const res = await this.t.request<{ endpoints?: WebhookEndpoint[] }>("GET", "/account/webhooks", {
      requireSecret: true,
    });
    return res.endpoints ?? [];
  }

  create(input: CreateWebhookInput, idempotencyKey?: string): Promise<CreatedWebhookEndpoint> {
    return this.t.request("POST", "/account/webhooks", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  get(endpointId: string): Promise<WebhookEndpoint> {
    return this.t.request("GET", `/account/webhooks/${encodeURIComponent(endpointId)}`, {
      requireSecret: true,
    });
  }

  delete(endpointId: string): Promise<void> {
    return this.t.request("DELETE", `/account/webhooks/${encodeURIComponent(endpointId)}`, {
      requireSecret: true,
    });
  }

  patch(endpointId: string, input: PatchWebhookInput): Promise<WebhookEndpoint> {
    return this.t.request("PATCH", `/account/webhooks/${encodeURIComponent(endpointId)}`, {
      body: input,
      requireSecret: true,
    });
  }

  rotateSecret(endpointId: string, idempotencyKey?: string): Promise<CreatedWebhookEndpoint> {
    return this.t.request("POST", `/account/webhooks/${encodeURIComponent(endpointId)}/rotate-secret`, {
      requireSecret: true,
      idempotencyKey,
    });
  }

  async listDeliveries(): Promise<WebhookDelivery[]> {
    const res = await this.t.request<{ deliveries?: WebhookDelivery[] }>(
      "GET",
      "/account/webhooks/deliveries",
      { requireSecret: true },
    );
    return res.deliveries ?? [];
  }
}
