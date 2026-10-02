import { FeedbackElement, InfiProvider, InfiSignals } from "@beinfi/elements-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Account } from "@/components/account";
import { environment, publishableKey, tenantSlug } from "@/lib/infi";
import "./globals.css";

export const metadata: Metadata = { title: "__APP_NAME__", description: "Loja digital feita com Infi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        {/* Only the publishable key, for signals and feedback; the sk_ never leaves the server. */}
        {/* Look & feel: appearance={{ accentColor: "#…" }}. */}
        {/* INFI_APP_URL only for a local Infi frontend; the default is Infi's own app. */}
        {/* Language: the elements follow <html lang> above (pt-BR or en), then the buyer's browser. */}
        {/* Force one with locale="en" here, or on a single element. */}
        <InfiProvider slug={tenantSlug()} environment={environment()} publishableKey={publishableKey()} appUrl={process.env.INFI_APP_URL}>
          <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <Link href="/" className="font-semibold">__APP_NAME__</Link>
            <Account />
          </header>
          {children}
          {/* What visitors do and say, in your dashboard → Comportamento. Mark sections with
              data-infi-section="…" and buttons with data-infi-cta="…" to see them by name. */}
          <InfiSignals apiUrl={process.env.INFI_API_URL} />
          <FeedbackElement />
        </InfiProvider>
      </body>
    </html>
  );
}
