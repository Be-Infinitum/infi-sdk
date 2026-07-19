import Link from "next/link";

export async function ClaimBanner() {
  const claimableId = process.env.INFI_CLAIM_ID;
  const claimUrl = process.env.INFI_CLAIM_URL;

  if (!claimableId || !claimUrl) return null;

  let claimed = false;
  try {
    // Dev-only claim poll — a plain public GET, no SDK surface (ADR 0001).
    const base = (process.env.INFI_API_URL ?? "https://api.beinfi.com").replace(/\/$/, "");
    const res = await fetch(`${base}/public/v1/claimables/${encodeURIComponent(claimableId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) {
      const view = (await res.json()) as { status?: string };
      claimed = view.status === "CLAIMED";
    }
  } catch {
    // Banner stays visible if status check fails (offline dev).
  }

  if (claimed) return null;

  return (
    <div className="border-b bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      Finalize a claim do seu tenant Infi para mantê-lo após o período de teste.{" "}
      <Link href={claimUrl} className="font-medium underline underline-offset-4" target="_blank">
        Claim agora →
      </Link>
    </div>
  );
}
