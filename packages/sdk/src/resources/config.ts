import type { Transport } from "../http.js";
import { sha256Hex } from "../sha256.js";
import type { CompanyDocument } from "../company-document.js";
import type {
  CompanyConfigApplyResult,
  CompanyConfigOptions,
  CompanyConfigPlan,
  CompanyConfigReceipt,
  CompanyConfigRevision,
  CompanyConfigRevisionDetail,
} from "../types.js";

/** Where the JSON Schema of the company document lives (public, no key). */
export const COMPANY_SCHEMA_URL = "https://api.beinfi.com/config/schema/v1.json";

export interface PlanCallOptions {
  /** `Accept-Language` for the plan's sentences: `pt-BR` or `en`. */
  locale?: string;
}

/** An apply's answer, with the HTTP outcome made explicit. */
export type ApplyOutcome =
  | ({ status: "applied" } & CompanyConfigApplyResult)
  | ({ status: "proposed"; approvalUrl: string } & CompanyConfigApplyResult);

export interface PromotionPackage {
  document: CompanyDocument;
  receipt: CompanyConfigReceipt;
}

/**
 * Company as code on the server (ADR 0025): `POST /config/plan` diffs a
 * document against the tenant, `POST /config/apply` applies the plan a caller
 * was shown. On live an apply only proposes: the answer carries the link where
 * a person approves it.
 *
 * Most callers want `infi.sync(config)`, which runs plan → apply and handles
 * the answers. This is the raw surface underneath.
 */
export class ConfigResource {
  constructor(private readonly t: Transport) {}

  /** The JSON Schema the document is validated against. Public. */
  schema(): Promise<Record<string, unknown>> {
    return this.t.request("GET", "/config/schema/v1.json");
  }

  /** Plan a document against this tenant. Writes nothing. */
  plan(
    document: CompanyDocument,
    options: CompanyConfigOptions = {},
    call: PlanCallOptions = {},
  ): Promise<CompanyConfigPlan> {
    return this.t.request("POST", "/config/plan", {
      body: { document, options },
      requireSecret: true,
      ...(call.locale ? { headers: { "Accept-Language": call.locale } } : {}),
    });
  }

  /**
   * Apply the plan whose `planHash` the caller showed. The hash is also the
   * Idempotency-Key, so retrying the same apply after a timeout replays it.
   *
   * Throws `InfiError` 409 `plan_stale` (the tenant moved; `metadata.planHash`
   * is the plan now) or `plan_blocked` (a change waits on a decision).
   */
  async apply(
    document: CompanyDocument,
    options: CompanyConfigOptions,
    planHash: string,
  ): Promise<ApplyOutcome> {
    const res = await this.t.request<CompanyConfigApplyResult>("POST", "/config/apply", {
      body: { document, options, planHash },
      requireSecret: true,
      idempotencyKey: planHash,
    });
    // The handler answers 202 exactly when the revision stays `planned`.
    if (res.revision.status === "planned") {
      return { ...res, status: "proposed", approvalUrl: res.approvalUrl ?? "" };
    }
    return { ...res, status: "applied" };
  }

  /** The tenant as a company document (what `infi pull` writes). */
  document(): Promise<CompanyDocument> {
    return this.t.request("GET", "/config/document", { requireSecret: true });
  }

  async revisions(query: { limit?: number; offset?: number } = {}): Promise<CompanyConfigRevision[]> {
    const res = await this.t.request<{ revisions: CompanyConfigRevision[] }>("GET", "/config/revisions", {
      query,
      requireSecret: true,
    });
    return res.revisions ?? [];
  }

  revision(id: string, call: PlanCallOptions = {}): Promise<CompanyConfigRevisionDetail> {
    return this.t.request("GET", `/config/revisions/${encodeURIComponent(id)}`, {
      requireSecret: true,
      ...(call.locale ? { headers: { "Accept-Language": call.locale } } : {}),
    });
  }

  /** Sandbox: sign an applied revision for live. Writes nothing. */
  promotionReceipt(revisionId: string): Promise<PromotionPackage> {
    return this.t.request("POST", `/config/revisions/${encodeURIComponent(revisionId)}/promotion-receipt`, {
      requireSecret: true,
    });
  }

  /**
   * Live: redeem a sandbox receipt. Always a proposal (202): a person approves
   * it at `approvalUrl`.
   */
  promote(
    pkg: PromotionPackage,
    options: CompanyConfigOptions = {},
    call: PlanCallOptions = {},
  ): Promise<CompanyConfigApplyResult & { plan: CompanyConfigPlan }> {
    return this.t.request("POST", "/config/promote", {
      body: { document: pkg.document, receipt: pkg.receipt, options },
      requireSecret: true,
      // One receipt is one promotion: a retry of the same receipt replays it,
      // and a fresh receipt (new issuedAt and signature) is a new promotion.
      idempotencyKey: `promote_${sha256Hex(JSON.stringify(pkg.receipt)).slice(0, 48)}`,
      ...(call.locale ? { headers: { "Accept-Language": call.locale } } : {}),
    });
  }
}
