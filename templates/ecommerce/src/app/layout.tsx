import { InfiProvider } from "@beinfi/elements-react";
import type { Metadata } from "next";
import Link from "next/link";
import { environment, tenantSlug } from "@/lib/infi";
import "./globals.css";

export const metadata: Metadata = { title: "__APP_NAME__", description: "Loja digital feita com Infi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        {/* No key here: the elements need none. Look & feel: appearance={{ accentColor: "#…" }}. */}
        <InfiProvider slug={tenantSlug()} environment={environment()} locale="pt-BR">
          <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <Link href="/" className="font-semibold">__APP_NAME__</Link>
            <Link href="/minhas-compras" className="text-sm text-muted-foreground hover:text-foreground">
              Minhas compras
            </Link>
          </header>
          {children}
        </InfiProvider>
      </body>
    </html>
  );
}
