import { type Resources, buildResources } from "./generated/facade.js";
import { Transport, type TransportConfig } from "./http.js";

export interface InfiConfig {
  secretKey: string;
  /** Sobrescreve a URL derivada do prefixo da chave. */
  apiUrl?: string;
  /** Para testes ou runtimes sem fetch global. */
  fetch?: typeof fetch;
}

export interface Infi extends Resources {}

export class Infi {
  constructor(config: InfiConfig & Partial<Pick<TransportConfig, "sleep" | "maxAttempts">>) {
    Object.assign(this, buildResources(new Transport(config)));
  }
}

export { paginate } from "./paginate.js";
export { verifyWebhook, type WebhookRequest } from "./webhooks.js";
export { InfiError, type CallOptions } from "./http.js";
export type { operations, components } from "./generated/openapi.js";
export type { Params, Result } from "./generated/facade.js";
