import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getBuyer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * A members-only page: signed in AND subscribed to the club. The check runs on
 * the server on every request, so a canceled or refunded member loses it at
 * once. Copy this for any gated page.
 */
export default async function ClubPage() {
  const buyer = await getBuyer();
  if (!buyer) redirect("/sign-in?next=/members");
  if (!buyer.has("ecommerce/club")) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-10 pb-20">
        <h1 className="text-3xl font-semibold tracking-tight">Área do clube</h1>
        <p className="mt-3 text-muted-foreground">Esta área é para quem assina o Clube mensal.</p>
        <Button asChild className="mt-6">
          <Link href="/">Ver o clube na loja</Link>
        </Button>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl px-6 pt-10 pb-20">
      <h1 className="text-3xl font-semibold tracking-tight">Área do clube</h1>
      <p className="mt-3 text-muted-foreground">Bem-vindo, {buyer.buyer.name ?? buyer.buyer.email}. O conteúdo do mês entra aqui.</p>
    </main>
  );
}
