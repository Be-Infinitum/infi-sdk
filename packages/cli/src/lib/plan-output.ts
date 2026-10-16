import pc from "picocolors";
import { orphanNotes, type CompanyConfigPlan, type HeldChange, type SyncResult } from "@beinfi/sdk";

const TAG: Record<string, (s: string) => string> = {
  create: pc.green,
  update: pc.cyan,
  bump: pc.cyan,
  publish: pc.cyan,
  rename: pc.cyan,
  archive: pc.magenta,
  blocked: pc.yellow,
  skip: pc.dim,
};

/** The plan in the server's own sentences, one change per line. */
export function printPlan(plan: CompanyConfigPlan, opts: { showSkips?: boolean } = {}): void {
  const rev = plan.baseRevision?.number ? ` on revision #${plan.baseRevision.number}` : "";
  console.log(pc.bold(`Plan (${plan.mode}${rev}):`));
  const shown = plan.changes.filter((c) => opts.showSkips || c.action !== "skip");
  if (!shown.length) console.log(pc.dim("  No changes."));
  for (const c of shown) {
    const tag = (TAG[c.action] ?? ((s: string) => s))(c.action.padEnd(7));
    console.log(`  ${tag} ${c.sentence}`);
    for (const s of c.version?.staying ?? []) {
      console.log(pc.dim(`          ${s.subscribers} subscriber(s) stay on v${s.version}.`));
    }
  }
  for (const o of orphanNotes(plan)) {
    console.log(pc.dim(`  orphan  ${o.sentence} (left alone; --archive-orphaned archives it)`));
  }
  for (const u of plan.unmanaged ?? []) {
    if (plan.changes.some((c) => c.key === u.key && c.action === "blocked")) continue;
    console.log(pc.dim(`  unmanaged ${u.sentence}`));
  }
}

const FLAG: Record<string, string> = {
  adoptUnmanaged: "--adopt-unmanaged",
  overwriteDrift: "--overwrite-drift",
  archiveOrphaned: "--archive-orphaned",
};

export function printHeld(held: HeldChange[]): void {
  console.log(pc.yellow(`\n⚠ ${held.length} change(s) held — nothing was applied:`));
  for (const h of held) {
    console.log(`  ${h.sentence}`);
    console.log(pc.dim(`    → ${h.option ? `${FLAG[h.option]}: ` : ""}${h.resolution}`));
  }
}

/** New webhook signing secrets: shown here once, never written to disk. */
export function printSecrets(secrets: NonNullable<SyncResult["secrets"]>): void {
  if (!secrets.length) return;
  console.log(pc.bold(pc.yellow("\nWebhook signing secrets — shown once, store them now:")));
  for (const s of secrets) console.log(`  ${s.url}\n    ${s.secret}`);
}

/** Exit code per status: 0 done or waiting on a person, 2 held, 3 stale. */
export function exitCodeFor(status: SyncResult["status"]): number {
  return status === "blocked" ? 2 : status === "stale" ? 3 : 0;
}

export { FLAG as OPTION_FLAGS };
