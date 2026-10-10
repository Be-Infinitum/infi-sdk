import { InfiProvider } from "@beinfi/elements-react";
import type { Metadata } from "next";
import Link from "next/link";
import { environment, tenantSlug } from "@/lib/infi";
import "./globals.css";

export const metadata: Metadata = { title: "__APP_NAME__", description: "Curso e área de membros feitos com Infi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        {/* Look & feel: appearance={{ accentColor: "#…" }}. */}
        {/* INFI_APP_URL only for a local Infi frontend; the default is Infi's own app. */}
        <InfiProvider slug={tenantSlug()} environment={environment()} locale="pt-BR" appUrl={process.env.INFI_APP_URL}>
          <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <Link href="/" className="font-semibold">__APP_NAME__</Link>
            <nav className="flex gap-5 text-sm text-muted-foreground">
              <Link href="/membros" className="hover:text-foreground">Área de membros</Link>
              <Link href="/minhas-compras" className="hover:text-foreground">Minhas compras</Link>
            </nav>
          </header>
          {children}
        </InfiProvider>
      </body>
    </html>
  );
}
