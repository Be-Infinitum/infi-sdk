import type { Transport } from "../http.js";
import type {
  CreateMeterRequest,
  CreateProductRequest,
  Meter,
  Price,
  PriceInput,
  Product,
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

  list(productId: string): Promise<Version[]> {
    return this.t.request("GET", `/metering/products/${enc(productId)}/versions`, {
      requireSecret: true,
    });
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

  list(productId: string, versionId: string): Promise<Price[]> {
    return this.t.request(
      "GET",
      `/metering/products/${enc(productId)}/versions/${enc(versionId)}/prices`,
      { requireSecret: true },
    );
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

  list(productId: string): Promise<Meter[]> {
    return this.t.request("GET", `/metering/products/${enc(productId)}/meters`, {
      requireSecret: true,
    });
  }
}

export class ProductsResource {
  readonly versions: VersionsResource;
  readonly prices: PricesResource;
  readonly meters: MetersResource;

  constructor(private readonly t: Transport) {
    this.versions = new VersionsResource(t);
    this.prices = new PricesResource(t);
    this.meters = new MetersResource(t);
  }

  create(input: CreateProductRequest, idempotencyKey?: string): Promise<Product> {
    return this.t.request("POST", "/metering/products", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  list(): Promise<Product[]> {
    return this.t.request("GET", "/metering/products", { requireSecret: true });
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
}
