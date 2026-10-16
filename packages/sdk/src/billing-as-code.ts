import type { Infi } from "./client.js";
import type {
  CompanyConfigChange,
  CompanyConfigListed,
  CompanyConfigOptions,
  CompanyConfigPlan,
  CompanyConfigRevision,
  PriceInput,
} from "./types.js";
import type { WebhookEventType } from "./webhooks.js";
import { InfiError } from "./errors.js";
import { toCompanyDocument, type CompanyDocument } from "./company-document.js";

// ── Declarative company config ("company as code" — ADR 0004, ADR 0025)
// Legacy name: billing as code. Prefer defineCompany() in new code.
//
// The server owns the diff (ADR 0025): this file is the typed authoring
// surface plus a thin client over POST /config/plan and /config/apply. ───────

export interface BillingMeter {
  /** The slug track() sends. Immutable: renaming it would stop ingestion. */
  key: string;
  displayName?: string;
  unit: "token" | "request" | "unit";
  /** What billing does with the events: only `sum` and `count` are billed. */
  aggregation: "sum" | "count";
  /**
   * JSON path on the usage event for the numeric value (backend ingest).
   * Use `"value"` for the standard `track({ value })` shape.
   */
  valueProperty?: string | null;
}

export interface BillingPrice {
  /**
   * Meter key this price rates — one of the product's `meters`. Required: a
   * flat amount is not a price, it is the product's `basePrice`.
   */
  meter: string;
  model: PriceInput["model"];
  unitAmount?: string;
  currency?: string;
  tiers?: PriceInput["tiers"];
}

/**
 * Declarative meter grant on the plan.
 * `on: "cycle"` credits at period open/renew; `on: "payment"` credits on
 * `payment.confirmed` (backend ADR 0021). One grant per meter per version.
 */
export interface BillingGrant {
  /** Catalog meter key (same as meters[].key). */
  meter: string;
  /** Decimal string amount to credit. */
  amount: string;
  on: "cycle" | "payment";
}

export interface BillingProduct {
  /** Stable natural key. Also the product name unless `name` is given. */
  key: string;
  /** The key this product had before: an explicit rename, never a delete + create. */
  renamedFrom?: string;
  name?: string;
  /** Shown on the product page and the checkout. */
  description?: string;
  /** Refund window in days (7–30, default 7): a refund asked inside it is automatic. */
  guaranteeDays?: number;
  type: "agent" | "item";
  pricingModel: "subscription" | "one_time" | "usage" | "prepaid";
  currency?: string;
  /** Required for subscription and prepaid, refused otherwise. */
  billingCycle?: "weekly" | "monthly" | "annual" | null;
  basePrice?: string | null;
  /**
   * @deprecated Write `grants: [{ meter, amount, on: "cycle" }]`. Serialized as
   * a cycle grant on the product's only meter; refused with zero or several.
   */
  creditsPerCycle?: string | null;
  /** Meter grants — credited on cycle renewal or on `payment.confirmed`. */
  grants?: BillingGrant[];
  meters?: BillingMeter[];
  prices?: BillingPrice[];
}

export interface BillingWebhook {
  /** Stable natural key — the delivery URL. https only. */
  url: `https://${string}`;
  /** Derived from the backend's enum, so an event the backend never emits is a compile error. */
  events: WebhookEventType[];
  isActive?: boolean;
}

export interface BillingConfig {
  products: BillingProduct[];
  /** Webhook endpoints (url + subscribed events). */
  webhooks?: BillingWebhook[];
}

/**
 * Identity helper for authoring a typed company/billing config.
 * Prefer `defineCompany` (same shape; company as code).
 */
export function defineBilling(config: BillingConfig): BillingConfig {
  return config;
}

/** One line of a plan — the server's change, with its sentence. */
export type SyncAction = CompanyConfigChange;

/** The decision a held change waits on. */
export type SyncOption = "adoptUnmanaged" | "archiveOrphaned" | "overwriteDrift";

/** A change the plan holds, and what resolves it. */
export interface HeldChange {
  resource: string;
  key: string;
  sentence: string;
  reason?: CompanyConfigChange["reason"];
  /** The option that lets it through, when one exists. */
  option?: SyncOption;
  /** What to do, in words (also when no option can resolve it). */
  resolution: string;
}

export type SyncStatus =
  /** `plan: true`: nothing was applied. */
  | "planned"
  /** The tenant already matches the file. */
  | "unchanged"
  /** Applied (sandbox). New webhook secrets are in `secrets`, shown once. */
  | "applied"
  /** Live: stored as a proposal. A person approves it at `approvalUrl`. */
  | "proposed"
  /** The tenant moved between plan and apply. `plan` is the fresh one; show it and ask again. */
  | "stale"
  /** A change waits on a decision. `held` says which option resolves each. */
  | "blocked";

export interface SyncResult {
  status: SyncStatus;
  /** True when nothing was applied because the caller asked for a plan. */
  planned: boolean;
  /** The plan the caller should show — on `stale`, the fresh one. */
  plan: CompanyConfigPlan;
  /** `plan.changes`, kept under the old name. */
  actions: SyncAction[];
  /** Held changes and how to resolve each (status `blocked`, or a blocked plan). */
  held: HeldChange[];
  revision?: CompanyConfigRevision;
  /** Live: where a person approves the proposal. Never retry the apply. */
  approvalUrl?: string;
  /** Signing secrets of the webhook endpoints this apply created. Shown once; store them now. */
  secrets?: Array<{ url: string; secret: string }>;
  /** The document that was planned. */
  document: CompanyDocument;
}

export interface SyncOptions extends CompanyConfigOptions {
  /** Plan only (like `terraform plan`). */
  plan?: boolean;
  /** `Accept-Language` for the plan's sentences. Defaults from `LANG` (pt → pt-BR, else en). */
  locale?: string;
  /** Called with the plan right before it is applied — show it here. */
  onPlan?: (plan: CompanyConfigPlan) => void | Promise<void>;
  /**
   * @deprecated Removed in 0.13. The server decides drift; pass
   * `adoptUnmanaged`, `archiveOrphaned` or `overwriteDrift` instead.
   */
  force?: never;
  /** @deprecated Ignored since 0.13: the server keeps the applied baseline. */
  lock?: unknown;
}

/** `pt-BR` when the environment speaks Portuguese, else `en`. */
export function defaultLocale(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const lang = env.INFI_LANG ?? env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? "";
  return /^pt/i.test(lang) ? "pt-BR" : "en";
}

const RESOLUTION: Record<string, { option?: SyncOption; resolution: string }> = {
  drift: {
    option: "overwriteDrift",
    resolution:
      "Edited outside the file since the last apply. Keep the edit with `infi pull`, or let the file win with overwriteDrift (--overwrite-drift).",
  },
  unmanaged: {
    option: "adoptUnmanaged",
    resolution:
      "Exists in the tenant but no revision wrote it (built by hand or by the old client-side sync). Take it over with adoptUnmanaged (--adopt-unmanaged).",
  },
  active_subscriptions: {
    resolution: "Subscribers still hold it. No option overrides this: keep it in the file until they move off.",
  },
  selling_links: {
    resolution: "A payment link still sells it. No option overrides this: deactivate the link, then plan again.",
  },
  immutable_field: {
    resolution:
      "That field cannot change in place (a meter key, for instance). No option overrides this: declare a new key instead.",
  },
  rename_conflict: {
    resolution: "renamedFrom names a key that is still declared or already taken. No option overrides this: fix renamedFrom.",
  },
};

/** Why each held change is held, and what lets it through. */
export function explainHeld(plan: CompanyConfigPlan): HeldChange[] {
  return plan.changes
    .filter((c) => c.action === "blocked")
    .map((c) => {
      const r = (c.reason && RESOLUTION[c.reason]) || {
        resolution: "Held by the server. Read the sentence, resolve it, and plan again.",
      };
      return { resource: c.resource, key: c.key, sentence: c.sentence, ...(c.reason ? { reason: c.reason } : {}), ...r };
    });
}

/** Orphaned resources the plan leaves alone (archived only with archiveOrphaned). */
export function orphanNotes(plan: CompanyConfigPlan): CompanyConfigListed[] {
  return plan.options?.archiveOrphaned ? [] : (plan.orphaned ?? []);
}

function optionsOf(opts: SyncOptions): CompanyConfigOptions {
  const o: CompanyConfigOptions = {};
  if (opts.adoptUnmanaged) o.adoptUnmanaged = true;
  if (opts.archiveOrphaned) o.archiveOrphaned = true;
  if (opts.overwriteDrift) o.overwriteDrift = true;
  return o;
}

function result(
  status: SyncStatus,
  plan: CompanyConfigPlan,
  document: CompanyDocument,
  extra: Partial<SyncResult> = {},
): SyncResult {
  return {
    status,
    planned: status === "planned",
    plan,
    actions: plan.changes,
    held: plan.blocked ? explainHeld(plan) : [],
    document,
    ...extra,
  };
}

/**
 * Apply a company config through the server (ADR 0025):
 *
 * 1. serialize it to the canonical document (schema v1);
 * 2. `POST /config/plan` — the diff, in sentences (`onPlan` sees it);
 * 3. `POST /config/apply` with `Idempotency-Key = planHash`.
 *
 * The answers become a `status`:
 * - `applied` — new webhook signing secrets are in `secrets`, once;
 * - `proposed` — live: the change waits for a person at `approvalUrl`. Never
 *   retried; approving is a dashboard action behind step-up;
 * - `stale` — the tenant moved since the plan. `plan` is the fresh one: show
 *   it and run again. A hash nobody saw is never applied;
 * - `blocked` — `held` names the option that resolves each held change.
 *
 * Nothing is diffed or locked on the client: drift, unmanaged and orphaned
 * resources are the server's call, against the last applied revision.
 */
export async function syncBilling(
  infi: Infi,
  config: BillingConfig,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  // Truthy only: 0.12 callers passed `force: flags.force ?? false`.
  if ((opts as { force?: unknown }).force) {
    throw new InfiError(
      "sync: `force` was removed. Pass adoptUnmanaged, archiveOrphaned or overwriteDrift — the option the plan names.",
      400,
      "sync_force_removed",
      { hint: "infi sync --plan shows which option each held change needs." },
    );
  }
  const document = toCompanyDocument(config);
  const options = optionsOf(opts);
  const locale = opts.locale ?? defaultLocale();

  const plan = await infi.config.plan(document, options, { locale });
  if (opts.plan) return result("planned", plan, document);
  if (plan.blocked) return result("blocked", plan, document);
  if (!plan.hasChanges) return result("unchanged", plan, document);
  await opts.onPlan?.(plan);

  try {
    const applied = await infi.config.apply(document, options, plan.planHash);
    if (applied.status === "proposed") {
      return result("proposed", plan, document, { revision: applied.revision, approvalUrl: applied.approvalUrl });
    }
    return result("applied", plan, document, { revision: applied.revision, secrets: applied.secrets ?? [] });
  } catch (err) {
    if (!(err instanceof InfiError) || err.status !== 409) throw err;
    if (err.code !== "plan_stale" && err.code !== "plan_blocked") throw err;
    // Plan again and hand that back: whoever applies must have seen it.
    const fresh = await infi.config.plan(document, options, { locale });
    return result(err.code === "plan_blocked" || fresh.blocked ? "blocked" : "stale", fresh, document);
  }
}
