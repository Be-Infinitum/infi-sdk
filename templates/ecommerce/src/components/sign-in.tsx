"use client";

import { LoginElement } from "@beinfi/elements-react";

export function SignIn({ redirectTo }: { redirectTo: string }) {
  return <LoginElement redirectTo={redirectTo} className="w-full" />;
}
