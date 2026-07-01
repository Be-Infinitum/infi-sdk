"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buyEbook } from "./actions";

export function BuyForm() {
  const [pending, startTransition] = useTransition();

  return (
    <form action={(fd) => startTransition(() => buyEbook(fd))} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Redirecionando…" : "Comprar agora"}
      </Button>
    </form>
  );
}
