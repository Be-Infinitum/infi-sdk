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
  | "provider_needed"
  | "webhook_pending"
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
    /** Where the merchant connects their own Stripe / Asaas account. */
    connect?: string;
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
 * Connection summary for the tenant's first usable provider, or null when it
 * cannot be read (no key / API refused).
 */
async function providerState(
  flags: GlobalFlags & { claimId?: string },
): Promise<{ connected: boolean; webhookRegistered: boolean; name: string } | null> {
  try {
    const { connections } = await infiClient(flags).providers.list();
    const usable = connections.find((c) => c.status === "connected") ?? connections[0];
    if (!usable) return { connected: false, webhookRegistered: false, name: "" };
    return {
      connected: usable.status === "connected" || usable.status === "pending_webhook",
      webhookRegistered: usable.webhookRegistered,
      name: usable.provider,
    };
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
  const connectUrl = `${dashboard}/go-live`;

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

  // The real gate to live money is a connected provider (backend ADR 0012 replaced
  // KYC with bring-your-own-provider), so ask the backend rather than guess.
  const provider = secretKey ? await providerState(flags) : null;

  let stage: GoLiveStage;
  const blockers: GoLiveStatus["blockers"] = [];
  let next: string;

  if (claimStatus === "UNCLAIMED") {
    stage = "sandbox_unclaimed";
    next = "Open the claim URL and create your Beinfi account — an unclaimed sandbox expires.";
    blockers.push({ code: "claim_required", message: "Tenant is still unclaimed.", url: claimUrl });
  } else if (provider === null) {
    stage = mode === "live" ? "live_ready" : stageFromClaim(claimStatus);
    // The provider surface is live-only, so a sandbox null is expected, not a fault.
    next =
      mode === "sandbox"
        ? "Sandbox charges through the built-in sandbox provider — connect your own Stripe/Asaas only when you switch to an sk_live_ key."
        : "Could not read provider connections (no key, or the API refused). Run infi providers list.";
  } else if (!provider.connected) {
    stage = "provider_needed";
    next = `Connect your own Stripe or Asaas account — that is where the money lands. ${connectUrl}`;
    blockers.push({
      code: "provider_required",
      message:
        "No payment provider connected. Connecting needs fresh MFA, so it is a dashboard action.",
      url: connectUrl,
    });
  } else if (!provider.webhookRegistered) {
    stage = "webhook_pending";
    next = `${provider.name} is connected but its webhook is not registered — you would never learn a payment succeeded. Finish it at ${connectUrl}`;
    blockers.push({
      code: "webhook_required",
      message: `${provider.name} webhook not registered.`,
      url: connectUrl,
    });
  } else if (mode === "live") {
    stage = "live_ready";
    next = "Live key + connected provider + registered webhook. Run infi doctor to confirm.";
  } else {
    stage = "sandbox_claimed";
    next =
      "Sandbox is ready end to end. Create an sk_live_ key in the dashboard and replace INFI_SECRET_KEY to take real money.";
  }

  return {
    stage,
    mode,
    next,
    urls: {
      claim: claimUrl,
      dashboard,
      account: `${dashboard}/signup`,
      connect: connectUrl,
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
  if (status.urls.connect) console.log(`  connect:   ${status.urls.connect}`);
  for (const b of status.blockers) {
    console.log(pc.yellow(`  ! ${b.message}${b.url ? ` → ${b.url}` : ""}`));
  }
  console.log(
    pc.dim(
      "\nAgents: guide the human through claim → connect provider → webhook. Connecting a provider needs fresh MFA, so it can only happen in the dashboard — never try it with an API key.",
    ),
  );
}

/** Exported for tests / MCP without process.exit. */
export function assertGoLiveKnown(flags: GlobalFlags & { claimId?: string }): void {
  if (!flags.claimId && !process.env.INFI_CLAIM_ID && !process.env.INFI_SECRET_KEY) {
    die("Pass --claim-id, set INFI_CLAIM_ID, or INFI_SECRET_KEY.");
  }
}
