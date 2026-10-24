// GERADO por scripts/gen-facade.ts — não edite
import type { operations } from "./openapi.js";
import type { CallOptions, Transport } from "../http.js";

type TransportHeaders = "Idempotency-Key" | "If-Match" | "X-Infi-Channel";
type Obj<T> = [T] extends [never] ? {} : T extends object ? T : {};
type Part<K extends keyof operations, P extends string> = operations[K]["parameters"] extends { [Q in P]?: infer V } ? Obj<NonNullable<V>> : {};
type Rest<K extends keyof operations> = Omit<Part<K, "header">, TransportHeaders>;
type Present<T> = [keyof T] extends [never] ? false : true;
type Opt<N extends string, T, Required extends boolean> = Present<T> extends false ? {} : Required extends true ? { [Q in N]: T } : { [Q in N]?: T };
type PathP<K extends keyof operations> = Opt<"path", Part<K, "path">, true>;
type QueryP<K extends keyof operations> = Opt<"query", Part<K, "query">, {} extends Part<K, "query"> ? false : true>;
type HeaderP<K extends keyof operations> = Opt<"headers", Rest<K>, {} extends Rest<K> ? false : true>;
type BodyOf<K extends keyof operations> = operations[K] extends { requestBody: { content: { "application/json": infer B } } }
  ? B
  : operations[K] extends { requestBody?: { content: { "application/json": infer B } } }
    ? B
    : never;
type BodyP<K extends keyof operations> = [BodyOf<K>] extends [never]
  ? {}
  : operations[K] extends { requestBody: unknown } ? { body: BodyOf<K> } : { body?: BodyOf<K> };
export type Params<K extends keyof operations> = PathP<K> & QueryP<K> & HeaderP<K> & BodyP<K>;
type Args<K extends keyof operations, O> = {} extends Params<K> ? [params?: Params<K>, options?: O] : [params: Params<K>, options?: O];
export type Result<K extends keyof operations> = operations[K]["responses"] extends infer R
  ? { [S in keyof R & (200 | 201 | 202)]: R[S] extends { content: { "application/json": infer B } } ? B : void }[keyof R & (200 | 201 | 202)]
  : never;

export class ConfigResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/config (scope config:read) */
  pull(...args: Args<"config_pull", CallOptions>): Promise<Result<"config_pull">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/config", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/config/apply (scope config:write) */
  apply(...args: Args<"config_apply", MutationOptions>): Promise<Result<"config_apply">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/config/apply", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/config/plan (scope config:write) */
  plan(...args: Args<"config_plan", MutationOptions>): Promise<Result<"config_plan">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/config/plan", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class CustomerSessionsResource {
  constructor(private readonly t: Transport) {}

  /** POST /v1/customer-sessions (scope billing:read) */
  create(...args: Args<"customer_sessions_create", MutationOptions>): Promise<Result<"customer_sessions_create">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/customer-sessions", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/customer-sessions/revoke (scope billing:read) */
  revoke(...args: Args<"customer_sessions_revoke", MutationOptions>): Promise<Result<"customer_sessions_revoke">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/customer-sessions/revoke", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** GET /v1/customer-sessions/verify (scope billing:read) */
  verify(...args: Args<"customer_sessions_verify", CallOptions>): Promise<Result<"customer_sessions_verify">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/customer-sessions/verify", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class CustomersResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/customers (scope customers:read) */
  list(...args: Args<"customers_list", CallOptions>): Promise<Result<"customers_list">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/customers", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/customers (scope customers:write) */
  create(...args: Args<"customers_create", MutationOptions>): Promise<Result<"customers_create">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/customers", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** GET /v1/customers/{customerId} (scope customers:read) */
  get(...args: Args<"customers_get", CallOptions>): Promise<Result<"customers_get">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/customers/{customerId}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** GET /v1/customers/{enrollmentId}/wallet (scope customers:read) */
  getWallet(...args: Args<"customers_get_wallet", CallOptions>): Promise<Result<"customers_get_wallet">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/customers/{enrollmentId}/wallet", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/customers/{enrollmentId}/wallet/credit (scope customers:write) */
  creditWallet(...args: Args<"customers_credit_wallet", MutationOptions>): Promise<Result<"customers_credit_wallet">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/customers/{enrollmentId}/wallet/credit", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class LinksResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/links/drafts/{draftKey} (scope links:write) */
  getDraft(...args: Args<"links_get_draft", CallOptions>): Promise<Result<"links_get_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/links/drafts/{draftKey}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** PUT /v1/links/drafts/{draftKey} (scope links:write) */
  saveDraft(...args: Args<"links_save_draft", MutationOptions>): Promise<Result<"links_save_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "PUT", path: "/v1/links/drafts/{draftKey}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/links/drafts/{draftKey}/publish (scope links:write) */
  publishDraft(...args: Args<"links_publish_draft", MutationOptions>): Promise<Result<"links_publish_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/links/drafts/{draftKey}/publish", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class PaymentsResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/payments (scope payments:read) */
  list(...args: Args<"payments_list", CallOptions>): Promise<Result<"payments_list">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/payments", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** GET /v1/payments/{paymentId} (scope payments:read) */
  get(...args: Args<"payments_get", CallOptions>): Promise<Result<"payments_get">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/payments/{paymentId}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class ProductsResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/products/drafts/{draftKey} (scope products:write) */
  getDraft(...args: Args<"products_get_draft", CallOptions>): Promise<Result<"products_get_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/products/drafts/{draftKey}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** PUT /v1/products/drafts/{draftKey} (scope products:write) */
  saveDraft(...args: Args<"products_save_draft", MutationOptions>): Promise<Result<"products_save_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "PUT", path: "/v1/products/drafts/{draftKey}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/products/drafts/{draftKey}/publish (scope products:write) */
  publishDraft(...args: Args<"products_publish_draft", MutationOptions>): Promise<Result<"products_publish_draft">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/products/drafts/{draftKey}/publish", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export class UsageResource {
  constructor(private readonly t: Transport) {}

  /** GET /v1/usage (scope usage:read) */
  get(...args: Args<"usage_get", CallOptions>): Promise<Result<"usage_get">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "GET", path: "/v1/usage", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

  /** POST /v1/usage/events (scope usage:write) */
  record(...args: Args<"usage_record", MutationOptions>): Promise<Result<"usage_record">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "POST", path: "/v1/usage/events", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }

}

export type MutationOptions = CallOptions;

export interface Resources {
  config: ConfigResource;
  customerSessions: CustomerSessionsResource;
  customers: CustomersResource;
  links: LinksResource;
  payments: PaymentsResource;
  products: ProductsResource;
  usage: UsageResource;
}

export function buildResources(t: Transport): Resources {
  return {
    config: new ConfigResource(t),
    customerSessions: new CustomerSessionsResource(t),
    customers: new CustomersResource(t),
    links: new LinksResource(t),
    payments: new PaymentsResource(t),
    products: new ProductsResource(t),
    usage: new UsageResource(t),
  };
}

/** Operações do contrato, para o teste de alcance. */
export const OPERATIONS = [
  {
    "operationId": "config_pull",
    "tag": "config",
    "property": "config",
    "method": "pull",
    "httpMethod": "GET",
    "path": "/v1/config",
    "scope": "config:read"
  },
  {
    "operationId": "config_apply",
    "tag": "config",
    "property": "config",
    "method": "apply",
    "httpMethod": "POST",
    "path": "/v1/config/apply",
    "scope": "config:write"
  },
  {
    "operationId": "config_plan",
    "tag": "config",
    "property": "config",
    "method": "plan",
    "httpMethod": "POST",
    "path": "/v1/config/plan",
    "scope": "config:write"
  },
  {
    "operationId": "customer_sessions_create",
    "tag": "customer_sessions",
    "property": "customerSessions",
    "method": "create",
    "httpMethod": "POST",
    "path": "/v1/customer-sessions",
    "scope": "billing:read"
  },
  {
    "operationId": "customer_sessions_revoke",
    "tag": "customer_sessions",
    "property": "customerSessions",
    "method": "revoke",
    "httpMethod": "POST",
    "path": "/v1/customer-sessions/revoke",
    "scope": "billing:read"
  },
  {
    "operationId": "customer_sessions_verify",
    "tag": "customer_sessions",
    "property": "customerSessions",
    "method": "verify",
    "httpMethod": "GET",
    "path": "/v1/customer-sessions/verify",
    "scope": "billing:read"
  },
  {
    "operationId": "customers_list",
    "tag": "customers",
    "property": "customers",
    "method": "list",
    "httpMethod": "GET",
    "path": "/v1/customers",
    "scope": "customers:read"
  },
  {
    "operationId": "customers_create",
    "tag": "customers",
    "property": "customers",
    "method": "create",
    "httpMethod": "POST",
    "path": "/v1/customers",
    "scope": "customers:write"
  },
  {
    "operationId": "customers_get",
    "tag": "customers",
    "property": "customers",
    "method": "get",
    "httpMethod": "GET",
    "path": "/v1/customers/{customerId}",
    "scope": "customers:read"
  },
  {
    "operationId": "customers_get_wallet",
    "tag": "customers",
    "property": "customers",
    "method": "getWallet",
    "httpMethod": "GET",
    "path": "/v1/customers/{enrollmentId}/wallet",
    "scope": "customers:read"
  },
  {
    "operationId": "customers_credit_wallet",
    "tag": "customers",
    "property": "customers",
    "method": "creditWallet",
    "httpMethod": "POST",
    "path": "/v1/customers/{enrollmentId}/wallet/credit",
    "scope": "customers:write"
  },
  {
    "operationId": "links_get_draft",
    "tag": "links",
    "property": "links",
    "method": "getDraft",
    "httpMethod": "GET",
    "path": "/v1/links/drafts/{draftKey}",
    "scope": "links:write"
  },
  {
    "operationId": "links_save_draft",
    "tag": "links",
    "property": "links",
    "method": "saveDraft",
    "httpMethod": "PUT",
    "path": "/v1/links/drafts/{draftKey}",
    "scope": "links:write"
  },
  {
    "operationId": "links_publish_draft",
    "tag": "links",
    "property": "links",
    "method": "publishDraft",
    "httpMethod": "POST",
    "path": "/v1/links/drafts/{draftKey}/publish",
    "scope": "links:write"
  },
  {
    "operationId": "payments_list",
    "tag": "payments",
    "property": "payments",
    "method": "list",
    "httpMethod": "GET",
    "path": "/v1/payments",
    "scope": "payments:read"
  },
  {
    "operationId": "payments_get",
    "tag": "payments",
    "property": "payments",
    "method": "get",
    "httpMethod": "GET",
    "path": "/v1/payments/{paymentId}",
    "scope": "payments:read"
  },
  {
    "operationId": "products_get_draft",
    "tag": "products",
    "property": "products",
    "method": "getDraft",
    "httpMethod": "GET",
    "path": "/v1/products/drafts/{draftKey}",
    "scope": "products:write"
  },
  {
    "operationId": "products_save_draft",
    "tag": "products",
    "property": "products",
    "method": "saveDraft",
    "httpMethod": "PUT",
    "path": "/v1/products/drafts/{draftKey}",
    "scope": "products:write"
  },
  {
    "operationId": "products_publish_draft",
    "tag": "products",
    "property": "products",
    "method": "publishDraft",
    "httpMethod": "POST",
    "path": "/v1/products/drafts/{draftKey}/publish",
    "scope": "products:write"
  },
  {
    "operationId": "usage_get",
    "tag": "usage",
    "property": "usage",
    "method": "get",
    "httpMethod": "GET",
    "path": "/v1/usage",
    "scope": "usage:read"
  },
  {
    "operationId": "usage_record",
    "tag": "usage",
    "property": "usage",
    "method": "record",
    "httpMethod": "POST",
    "path": "/v1/usage/events",
    "scope": "usage:write"
  }
] as const;
