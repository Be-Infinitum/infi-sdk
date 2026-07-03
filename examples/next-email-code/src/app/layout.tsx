import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import UsageSection from "./UsageSection";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Infi email-code demo",
  description: "Embedded, hosted, and headless email-code auth delivery modes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen bg-muted/30 font-sans`}>
        {children}
        {/* App-level send-budget usage (see UsageSection for why it's app-scoped). */}
        <UsageSection />
      </body>
    </html>
  );
}
