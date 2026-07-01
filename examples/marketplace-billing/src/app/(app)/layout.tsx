import { LogOut } from "lucide-react";
import { requireOperator } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const op = await requireOperator();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div>
          <div className="text-lg font-semibold tracking-tight">Marketplace billing</div>
          <p className="text-xs text-muted-foreground">Cobrança por uso, preço por organização</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground" title={op.email ?? op.id}>
            {op.email ?? op.id}
          </span>
          <Button asChild variant="ghost" size="sm">
            <a href="/api/auth/logout">
              <LogOut className="size-4" /> Sair
            </a>
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
