import type { Transport } from "../http.js";
import {
  SubscriptionsResource,
  type CreateSubscriptionInput,
  type SubscriptionWithPeriod,
} from "./subscriptions.js";
import type {
  CreateCustomerRequest,
  CreateMeterRequest,
  UpdateMeterRequest,
  CreateProductRequest,
  Deliverable,
  Meter,
  PresignDeliverableRequest,
  PresignDeliverableResponse,
  Price,
  PriceInput,
  Product,
  ProductCustomer,
  PutDeliverableRequest,
  Version,
  VersionInput,
} from "../types.js";

const enc = encodeURIComponent;

class VersionsResource {
  constructor(private readonly t: Transport) {}

  create(productId: string, input: VersionInput = {}, idempotencyKey?: string): Promise<Version> {
    return this.t.request("POST", `/metering/products/${enc(productId)}/versions`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  async list(productId: string): Promise<Version[]> {
    const res = await this.t.request<{ versions?: Version[] }>(
      "GET",
      `/metering/products/${enc(productId)}/versions`,
      { requireSecret: true },
    );
    return res.versions ?? [];
  }

  publish(productId: string, versionId: string): Promise<Version> {
    return this.t.request(
      "POST",
      `/metering/products/${enc(productId)}/versions/${enc(versionId)}/publish`,
      { requireSecret: true },
    );
  }
}

class PricesResource {
  constructor(private readonly t: Transport) {}

  add(productId: string, versionId: string, input: PriceInput, idempotencyKey?: string): Promise<Price> {
    return this.t.request(
      "POST",
      `/metering/products/${enc(productId)}/versions/${enc(versionId)}/prices`,
      { body: input, requireSecret: true, idempotencyKey },
    );
  }

  async list(productId: string, versionId: string): Promise<Price[]> {
    const res = await this.t.request<{ prices?: Price[] }>(
      "GET",
      `/metering/products/${enc(productId)}/versions/${enc(versionId)}/prices`,
      { requireSecret: true },
    );
    return res.prices ?? [];
  }
}

class MetersResource {
  constructor(private readonly t: Transport) {}

  create(productId: string, input: CreateMeterRequest, idempotencyKey?: string): Promise<Meter> {
    return this.t.request("POST", `/metering/products/${enc(productId)}/meters`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  async list(productId: string): Promise<Meter[]> {
    const res = await this.t.request<{ meters?: Meter[] }>(
      "GET",
      `/metering/products/${enc(productId)}/meters`,
      { requireSecret: true },
    );
    return res.meters ?? [];
  }

  /** Update a meter's display name / unit / aggregation (the `name` slug is immutable). */
  update(productId: string, meterId: string, patch: UpdateMeterRequest): Promise<Meter> {
    return this.t.request("PATCH", `/metering/products/${enc(productId)}/meters/${enc(meterId)}`, {
      body: patch,
      requireSecret: true,
    });
  }
}

class DeliverableResource {
  constructor(private readonly t: Transport) {}

  /** Presign an R2 upload URL for a file deliverable (upload the bytes to it, then `save`). */
  presign(productId: string, input: PresignDeliverableRequest): Promise<PresignDeliverableResponse> {
    return this.t.request("POST", `/metering/products/${enc(productId)}/deliverable/presign`, {
      body: input,
      requireSecret: true,
    });
  }

  /** Save (create/replace) the deliverable — kind `file` (with objectKey) or `link` (with url). */
  save(productId: string, input: PutDeliverableRequest): Promise<Deliverable> {
    return this.t.request("PUT", `/metering/products/${enc(productId)}/deliverable`, {
      body: input,
      requireSecret: true,
    });
  }

  get(productId: string): Promise<Deliverable> {
    return this.t.request("GET", `/metering/products/${enc(productId)}/deliverable`, {
      requireSecret: true,
    });
  }

  delete(productId: string): Promise<void> {
    return this.t.request("DELETE", `/metering/products/${enc(productId)}/deliverable`, {
      requireSecret: true,
    });
  }
}

export class ProductsResource {
  readonly versions: VersionsResource;
  readonly prices: PricesResource;
  readonly meters: MetersResource;
  readonly deliverable: DeliverableResource;
  #subscriptions: SubscriptionsResource;

  constructor(private readonly t: Transport) {
    this.versions = new VersionsResource(t);
    this.prices = new PricesResource(t);
    this.meters = new MetersResource(t);
    this.deliverable = new DeliverableResource(t);
    this.#subscriptions = new SubscriptionsResource(t);
  }

  /**
   * Create a product. The backend also seeds a first draft version and returns
   * `{ product, version }`; this unwraps to the product (use `versions.list` to
   * get the seeded draft).
   */
  async create(input: CreateProductRequest, idempotencyKey?: string): Promise<Product> {
    const res = await this.t.request<{ product?: Product } & Product>("POST", "/metering/products", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
    return res.product ?? res;
  }

  async list(): Promise<Product[]> {
    const res = await this.t.request<{ products?: Product[] }>("GET", "/metering/products", {
      requireSecret: true,
    });
    return res.products ?? [];
  }

  get(productId: string): Promise<Product> {
    return this.t.request("GET", `/metering/products/${enc(productId)}`, { requireSecret: true });
  }

  update(productId: string, patch: Partial<CreateProductRequest>): Promise<Product> {
    return this.t.request("PATCH", `/metering/products/${enc(productId)}`, {
      body: patch,
      requireSecret: true,
    });
  }

  /** Enroll a customer in this product (idempotent). Returns the enrollment —
   *  the id used by credits/subscriptions/usage. Creates the customer if new. */
  enroll(productId: string, input: CreateCustomerRequest, idempotencyKey?: string): Promise<ProductCustomer> {
    return this.t.request("POST", `/metering/products/${enc(productId)}/customers`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Subscribe an enrollment to this product (opens its first billing period).
   *  Ergonomic alias for `infi.subscriptions.create`. */
  subscribe(
    productId: string,
    input: CreateSubscriptionInput,
    idempotencyKey?: string,
  ): Promise<SubscriptionWithPeriod> {
    return this.#subscriptions.create(productId, input, idempotencyKey);
  }
}
