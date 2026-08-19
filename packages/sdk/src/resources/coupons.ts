import type { Transport } from "../http.js";
import type { Coupon, CreateCouponRequest } from "../types.js";

const enc = encodeURIComponent;

/**
 * Coupons — tenant-wide merchant discounts applied to subscription invoices
 * (Stripe-style duration: once / repeating / forever). Server-side, secret key.
 */
export class CouponsResource {
  constructor(private readonly t: Transport) {}

  async list(): Promise<Coupon[]> {
    const res = await this.t.request<{ coupons?: Coupon[] }>("GET", "/billing/coupons", {
      requireSecret: true,
    });
    return res.coupons ?? [];
  }

  create(input: CreateCouponRequest, idempotencyKey?: string): Promise<Coupon> {
    return this.t.request("POST", "/billing/coupons", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  get(couponId: string): Promise<Coupon> {
    return this.t.request("GET", `/billing/coupons/${enc(couponId)}`, { requireSecret: true });
  }

  delete(couponId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/billing/coupons/${enc(couponId)}`, {
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Archive or re-activate a coupon (no destructive edit of terms). */
  updateStatus(couponId: string, status: "active" | "archived", idempotencyKey?: string): Promise<Coupon> {
    return this.t.request("PATCH", `/billing/coupons/${enc(couponId)}`, {
      body: { status },
      requireSecret: true,
      idempotencyKey,
    });
  }
}
