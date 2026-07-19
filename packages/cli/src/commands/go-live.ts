import type { GlobalFlags } from "../lib/client.js";
import { apiBase, resolveSecretKey } from "../lib/client.js";
import { getClaimable } from "../lib/claim.js";
import { die, ok, printJson } from "../lib/output.js";
import pc from "picocolors";

export type GoLiveStage =
  | "sandbox_unclaimed"
  | "sandbox_claimed"
  | "account_needed"
  | "kyc_pending"
  | "kyc_approved"
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
    kyc?: string;
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

const DASHBOARD = "https://app.beinfi.com";

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

  const mode: "sandbox" | "live" =
    secretKey?.startsWith("sk_live_") ? "live" : "sandbox";

  const claimId = flags.claimId ?? process.env.INFI_CLAIM_ID;
  const claimUrlEnv = process.env.INFI_CLAIM_URL;

  let claimable: GoLiveStatus["claimable"];
  let claimStatus: string | undefined;
  let claimUrl = claimUrlEnv;

  if (claimId) {
    try {
      const view = await getClaimable(api, claimId);
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
        dashboard: DASHBOARD,
        ...b.urls,
        claim: b.urls?.claim ?? claimUrl,
      },
      blockers: b.blockers ?? [],
      claimable,
      backend,
    };
  }

  const stage = mode === "live" ? "live_ready" : stageFromClaim(claimStatus);

  const blockers: GoLiveStatus["blockers"] = [];
  let next: string;

  switch (stage) {
    case "sandbox_unclaimed":
      next =
        "Open the claim URL in a browser, create your Beinfi account, then complete KYC before using sk_live_ keys.";
      blockers.push({
        code: "claim_required",
        message: "Tenant is still unclaimed.",
        url: claimUrl,
      });
      break;
    case "sandbox_claimed":
      next =
        "Finish account setup + KYC in the dashboard, then create an sk_live_ key and replace INFI_SECRET_KEY in production.";
      blockers.push({
        code: "kyc_required",
        message: "Claimed — complete KYC to accept real payments.",
        url: `${DASHBOARD}/kyc`,
      });
      break;
    case "live_ready":
      next = "Live key detected. Run infi doctor and ensure production APP_URL allowlists are synced.";
      break;
    default:
      next =
        "Set INFI_CLAIM_ID / INFI_CLAIM_URL from bootstrap, or open the dashboard to claim and complete KYC.";
      if (claimUrl) {
        blockers.push({ code: "claim_required", message: "Claim your sandbox tenant.", url: claimUrl });
      }
  }

  return {
    stage,
    mode,
    next,
    urls: {
      claim: claimUrl,
      dashboard: DASHBOARD,
      account: `${DASHBOARD}/signup`,
      kyc: `${DASHBOARD}/kyc`,
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
  if (status.urls.kyc) console.log(`  kyc:       ${status.urls.kyc}`);
  for (const b of status.blockers) {
    console.log(pc.yellow(`  ! ${b.message}${b.url ? ` → ${b.url}` : ""}`));
  }
  console.log(
    pc.dim(
      "\nAgents: guide the human through claim → account → KYC. Never invent sk_live_ before KYC is approved.",
    ),
  );
}

/** Exported for tests / MCP without process.exit. */
export function assertGoLiveKnown(flags: GlobalFlags & { claimId?: string }): void {
  if (!flags.claimId && !process.env.INFI_CLAIM_ID && !process.env.INFI_SECRET_KEY) {
    die("Pass --claim-id, set INFI_CLAIM_ID, or INFI_SECRET_KEY.");
  }
}
