import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ClaimBanner } from "@/components/claim-banner";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/infi";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <ClaimBanner />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-muted-foreground">Powered by Infi</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {APP_NAME}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Seu app fullstack com auth, checkout e billing prontos. Edite esta landing como quiser —
          a infra de receita já vem configurada.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              Entrar <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Ver dashboard</Link>
          </Button>
        </div>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Auth, checkout hosted e medição de uso via{" "}
        <a href="https://beinfi.com" className="underline underline-offset-4">
          Infi
        </a>
      </footer>
    </div>
  );
}
