import pc from "picocolors";
import { Infi, InfiError, modeFromKey, type CompanyConfigOptions } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { apiBaseOverride, findSecretKey } from "../lib/client.js";
import { ok, printJson } from "../lib/output.js";
import { printPlan } from "../lib/plan-output.js";

export type PromoteFlags = GlobalFlags &
  CompanyConfigOptions & {
    revision: string;
    /** Sandbox key that signs the receipt. */
    fromKey?: string;
    /** Live key that redeems it. */
    toKey?: string;
  };

/** The two keys a promotion needs: a sandbox one to sign, a live one to redeem. */
export function promotionKeys(flags: PromoteFlags): { sandbox: string; live: string } {
  const configured = findSecretKey(flags);
  const sandbox =
    flags.fromKey ??
    process.env.INFI_SANDBOX_SECRET_KEY ??
    (configured && modeFromKey(configured) === "sandbox" ? configured : undefined);
  const live =
    flags.toKey ??
    process.env.INFI_LIVE_SECRET_KEY ??
    (configured && modeFromKey(configured) === "live" ? configured : undefined);
  if (!sandbox || !sandbox.startsWith("sk_test_")) {
    throw new InfiError(
      "infi promote needs a sandbox key to sign the receipt: --from-key sk_test_… or INFI_SANDBOX_SECRET_KEY.",
      400,
      "promotion_sandbox_key_required",
    );
  }
  if (!live || !live.startsWith("sk_live_")) {
    throw new InfiError(
      "infi promote needs a live key to propose on live: --to-key sk_live_… or INFI_LIVE_SECRET_KEY.",
      400,
      "promotion_live_key_required",
    );
  }
  return { sandbox, live };
}

/**
 * `infi promote <crev>`: the sandbox signs an applied revision's document
 * (POST /config/revisions/{crev}/promotion-receipt), and live plans that exact
 * document as a proposal (POST /config/promote). What goes to live is the
 * document the sandbox applied, never the local file and never rows.
 */
export async function promoteCommand(flags: PromoteFlags): Promise<void> {
  const keys = promotionKeys(flags);
  // INFI_API_URL / --local pin one host for both (local stacks); otherwise each
  // key finds its own host from its prefix.
  const pinned = apiBaseOverride(flags)?.url;
  const sandbox = new Infi({ secretKey: keys.sandbox, ...(pinned ? { apiUrl: pinned } : {}) });
  const live = new Infi({ secretKey: keys.live, ...(pinned ? { apiUrl: pinned } : {}) });

  const pkg = await sandbox.config.promotionReceipt(flags.revision);
  const options: CompanyConfigOptions = {};
  if (flags.adoptUnmanaged) options.adoptUnmanaged = true;
  if (flags.archiveOrphaned) options.archiveOrphaned = true;
  if (flags.overwriteDrift) options.overwriteDrift = true;
  const res = await live.config.promote(pkg, options);

  if (flags.json) {
    printJson({ status: "proposed", revision: res.revision, approvalUrl: res.approvalUrl, plan: res.plan, receipt: pkg.receipt });
    return;
  }
  printPlan(res.plan);
  ok(`\nProposed on live as revision #${res.revision.number} (from sandbox ${pkg.receipt.sourceRevisionId}).`);
  console.log(`  Approve it here: ${pc.bold(res.approvalUrl ?? "")}`);
  console.log(pc.dim("  Nothing changes on live until a person approves it."));
}
