import type { GlobalFlags } from "../lib/client.js";
import {
  apiBase,
  appBase,
  infiClient,
  provisioningApiBase,
  resolveMode,
  resolveSecretKey,
} from "../lib/client.js";
import { getClaimable } from "../lib/claim.js";
import { die, ok, printJson } from "../lib/output.js";
import pc from "picocolors";

export type GoLiveStage =
  | "sandbox_unclaimed"
  | "sandbox_claimed"
  /** The merchant-of-record application is missing or was rejected. */
  | "admission_needed"
  /** Submitted, waiting for Infi's review. */
  | "admission_pending"
  /** Admitted, still on a sandbox key: create sk_live_. */
  | "live_key_needed"
  | "live_ready"
  | "unknown";

export type GoLiveStatus = {
  stage: GoLiveStage;
  mode: "sandbox" | "live";
  next: string;
  urls: {
    claim?: string;
    dashboard: string;
    account?: string;
    /** Where the account owner applies for merchant-of-record admission (UK Ltd). */
    admission?: string;
  };
  blockers: Array<{ code: string; message: string; url?: string }>;
  claimable?: {
    id: string;
    status: string;
    tenantSlug: string;
  };
  /**
   * When the backend exposes GET /account/go-live, this is the raw payload.
   * Until then agents follow `stage` + `next` + `urls`.
   */
  backend?: unknown;
};


async function tryBackendGoLive(api: string, secretKey: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/account/go-live`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The merchant-of-record admission status (ADR 0018), or null when it cannot
 * be read (no key, a sandbox that does not serve it, the API refused).
 */
async function admissionState(
  flags: GlobalFlags & { claimId?: string },
): Promise<{ status: "draft" | "submitted" | "approved" | "rejected"; reason: string | null } | null> {
  try {
    const { admission } = await infiClient(flags).account.mor();
    return { status: admission.status, reason: admission.decisionReason };
  } catch {
    return null;
  }
}

function stageFromClaim(status: string | undefined): GoLiveStage {
  if (!status) return "unknown";
  if (status === "UNCLAIMED") return "sandbox_unclaimed";
  if (status === "CLAIMED") return "sandbox_claimed";
  return "unknown";
}

export async function getGoLiveStatus(
  flags: GlobalFlags & { claimId?: string },
): Promise<GoLiveStatus> {
  const api = apiBase(flags);
  let secretKey: string | undefined;
  try {
    secretKey = resolveSecretKey(flags);
  } catch {
    secretKey = undefined;
  }

  const mode = resolveMode(flags);
  // Sandbox and live are separate dashboards — a sandbox tenant does not exist
  // on app.beinfi.com, so a hardcoded live link sends the user to a 404.
  const dashboard = appBase(flags);
  const admissionUrl = `${dashboard}/go-live`;

  const claimId = flags.claimId ?? process.env.INFI_CLAIM_ID;
  const claimUrlEnv = process.env.INFI_CLAIM_URL;

  let claimable: GoLiveStatus["claimable"];
  let claimStatus: string | undefined;
  let claimUrl = claimUrlEnv;

  if (claimId) {
    try {
      // Claimables are sandbox-only, wherever the account key now points.
      const view = await getClaimable(provisioningApiBase(flags), claimId);
      claimable = {
        id: view.id,
        status: view.status,
        tenantSlug: view.tenantSlug,
      };
      claimStatus = view.status;
    } catch {
      // claim id may be stale
    }
  }

  const backend = secretKey ? await tryBackendGoLive(api, secretKey) : null;
  if (backend && typeof backend === "object" && backend !== null && "stage" in backend) {
    const b = backend as {
      stage: GoLiveStage;
      next?: string;
      urls?: GoLiveStatus["urls"];
      blockers?: GoLiveStatus["blockers"];
    };
    return {
      stage: b.stage,
      mode,
      next: b.next ?? "Follow the dashboard URL.",
      urls: {
        dashboard,
        ...b.urls,
        claim: b.urls?.claim ?? claimUrl,
      },
      blockers: b.blockers ?? [],
      claimable,
      backend,
    };
  }

  // The gate to live money is the merchant-of-record admission (ADR 0018):
  // the UK Ltd is the legal seller, the merchant applies to supply through it.
  // Merchants no longer bring their own PSP (BYOP is enterprise-only).
  const admission = secretKey ? await admissionState(flags) : null;

  let stage: GoLiveStage;
  const blockers: GoLiveStatus["blockers"] = [];
  let next: string;

  if (claimStatus === "UNCLAIMED") {
    stage = "sandbox_unclaimed";
    next = "Open the claim URL and create your Beinfi account — an unclaimed sandbox expires.";
    blockers.push({ code: "claim_required", message: "Tenant is still unclaimed.", url: claimUrl });
  } else if (admission === null) {
    stage = mode === "live" ? "unknown" : stageFromClaim(claimStatus);
    next =
      mode === "sandbox"
        ? `Sandbox charges need no admission. To sell live, the account owner applies for merchant-of-record admission at ${admissionUrl}.`
        : `Could not read the merchant-of-record admission (no key, or the API refused). Check it at ${admissionUrl}.`;
  } else if (admission.status === "draft" || admission.status === "rejected") {
    stage = "admission_needed";
    next =
      admission.status === "rejected"
        ? `The merchant-of-record application was rejected${admission.reason ? ` (${admission.reason})` : ""}. Fix it and resubmit at ${admissionUrl}.`
        : `Apply for merchant-of-record admission (Infi's UK Ltd sells, you supply) at ${admissionUrl}. The account owner fills it in the dashboard.`;
    blockers.push({
      code: "mor_admission_required",
      message: "Live sales need an approved merchant-of-record admission.",
      url: admissionUrl,
    });
  } else if (admission.status === "submitted") {
    stage = "admission_pending";
    next = "The merchant-of-record application is under review. Keep building in sandbox; nothing to do until it is decided.";
    blockers.push({ code: "mor_admission_pending", message: "Admission submitted, waiting for review.", url: admissionUrl });
  } else if (mode === "live") {
    stage = "live_ready";
    next = "Admitted and on a live key. Run infi doctor to confirm, then `infi sync` proposes the catalog on live.";
  } else {
    stage = "live_key_needed";
    next =
      "Admitted. Create an sk_live_ key in the dashboard, replace INFI_SECRET_KEY in your server secrets, and run infi doctor.";
  }

  return {
    stage,
    mode,
    next,
    urls: {
      claim: claimUrl,
      dashboard,
      account: `${dashboard}/signup`,
      admission: admissionUrl,
    },
    blockers,
    claimable,
    backend: backend ?? undefined,
  };
}

export async function goLiveCommand(
  flags: GlobalFlags & { claimId?: string },
): Promise<void> {
  const status = await getGoLiveStatus(flags);

  if (flags.json) {
    printJson(status);
    return;
  }

  ok(`Go-live status: ${status.stage} (${status.mode})`);
  console.log(`  ${status.next}`);
  if (status.urls.claim) console.log(`  claim:     ${status.urls.claim}`);
  console.log(`  dashboard: ${status.urls.dashboard}`);
  if (status.urls.admission) console.log(`  admission: ${status.urls.admission}`);
  for (const b of status.blockers) {
    console.log(pc.yellow(`  ! ${b.message}${b.url ? ` → ${b.url}` : ""}`));
  }
  console.log(
    pc.dim(
      "\nAgents: guide the human through claim → merchant-of-record admission (dashboard /go-live) → sk_live_. The application is the account owner's to fill; never fill or submit it with an API key.",
    ),
  );
}

/** Exported for tests / MCP without process.exit. */
export function assertGoLiveKnown(flags: GlobalFlags & { claimId?: string }): void {
  if (!flags.claimId && !process.env.INFI_CLAIM_ID && !process.env.INFI_SECRET_KEY) {
    die("Pass --claim-id, set INFI_CLAIM_ID, or INFI_SECRET_KEY.");
  }
}
