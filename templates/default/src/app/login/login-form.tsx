"use client";

import { InfiLogin } from "@beinfi/sdk/react";

export function LoginForm({
  slug,
  apiUrl,
  redirectTo,
}: {
  slug: string;
  apiUrl: string;
  redirectTo: string;
}) {
  return (
    <InfiLogin
      slug={slug}
      apiUrl={apiUrl}
      redirectTo={redirectTo}
      sendLabel="Enviar código"
      verifyLabel="Entrar"
      className="flex flex-col gap-3"
      inputClassName="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm text-center shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      buttonClassName="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
      onError={(e) => console.error("login:", e.message)}
    />
  );
}
