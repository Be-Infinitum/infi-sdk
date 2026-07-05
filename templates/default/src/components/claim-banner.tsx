import { publicInfi } from "@/lib/infi";
import Link from "next/link";

export async function ClaimBanner() {
  const sandboxId = process.env.INFI_SANDBOX_ID;
  const claimUrl = process.env.INFI_SANDBOX_CLAIM_URL;

  if (!sandboxId || !claimUrl) return null;

  let claimed = false;
  try {
    const view = await publicInfi.sandbox.get(sandboxId);
    claimed = view.status === "CLAIMED";
  } catch {
    // Banner stays visible if status check fails (offline dev).
  }

  if (claimed) return null;

  return (
    <div className="border-b bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      Finalize a claim do seu sandbox Infi para manter este tenant após o período de teste.{" "}
      <Link href={claimUrl} className="font-medium underline underline-offset-4" target="_blank">
        Claim agora →
      </Link>
    </div>
  );
}
