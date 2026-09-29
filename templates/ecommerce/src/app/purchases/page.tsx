import { Portal } from "@/components/portal";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** "Minhas compras": the same session as the store login; signed out, the frame asks for the code. */
export default async function PortalPage() {
  const token = await auth.getToken();
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Minhas compras</h1>
      <div className="mt-8">
        <Portal token={token} />
      </div>
    </main>
  );
}
