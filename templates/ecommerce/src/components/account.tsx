"use client";

import { useInfiAuth } from "@beinfi/elements-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The header's corner: "Entrar", or who is in with a way out. */
export function Account() {
  const auth = useInfiAuth();
  if (auth.status === "loading") return <span className="h-8 w-20" aria-hidden />;
  if (auth.status === "signed_out") {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Link href="/purchases" className="text-muted-foreground hover:text-foreground">
          Minhas compras
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">Entrar</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/purchases" className="text-muted-foreground hover:text-foreground">
        Minhas compras
      </Link>
      <span className="hidden text-muted-foreground sm:inline">{auth.buyer?.buyer.email}</span>
      <Button size="sm" variant="ghost" onClick={() => void auth.signOut().then(() => window.location.assign("/"))}>
        Sair
      </Button>
    </div>
  );
}
