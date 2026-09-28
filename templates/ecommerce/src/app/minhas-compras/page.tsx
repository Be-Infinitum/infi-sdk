import { cookies } from "next/headers";
import { Portal } from "@/components/portal";

export const dynamic = "force-dynamic";

/** "Minhas compras": login by a 6-digit code inside the Infi frame, 30 days on this device. */
export default async function PortalPage() {
  const token = (await cookies()).get("infi_bt")?.value ?? null;
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Minhas compras</h1>
      <div className="mt-8">
        <Portal token={token} />
      </div>
    </main>
  );
}
