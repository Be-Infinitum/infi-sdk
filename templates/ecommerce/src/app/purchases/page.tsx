import { Portal } from "@/components/portal";
import { getBuyerToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** "Minhas compras": the same session as the store login; signed out, the frame offers "Entrar com Infi". */
export default async function PortalPage() {
  const token = await getBuyerToken();
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Minhas compras</h1>
      <div className="mt-8">
        <Portal token={token} />
      </div>
    </main>
  );
}
