import Link from "next/link";
import { Gauge, Home, LogOut, CreditCard } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/infi";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="px-2 py-3 text-lg font-semibold tracking-tight">{APP_NAME}</div>
        <nav className="mt-2 flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Home className="size-4" /> Início
          </Link>
          <Link
            href="/dashboard/billing"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Gauge className="size-4" /> Plano e uso
          </Link>
        </nav>
        <div className="mt-auto border-t pt-3">
          <p className="truncate px-2 text-xs text-muted-foreground" title={user.email ?? user.id}>
            {user.email ?? user.id}
          </p>
          <Button asChild variant="ghost" size="sm" className="mt-1 w-full justify-start">
            <a href="/api/auth/logout">
              <LogOut className="size-4" /> Sair
            </a>
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
