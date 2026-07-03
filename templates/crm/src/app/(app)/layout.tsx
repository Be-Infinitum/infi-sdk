import Link from "next/link";
import { Users, KanbanSquare, Gauge, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="px-2 py-3 text-lg font-semibold tracking-tight">CRM</div>
        <nav className="mt-2 flex flex-col gap-1">
          <Link
            href="/contacts"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Users className="size-4" /> Contatos
          </Link>
          <Link
            href="/pipeline"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <KanbanSquare className="size-4" /> Pipeline
          </Link>
          <Link
            href="/usage"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Gauge className="size-4" /> Uso
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
