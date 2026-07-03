import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardHomePage() {
  const user = await requireOnboardedUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá{user.email ? `, ${user.email}` : ""}. Seu app já está conectado ao Infi.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
          <CardDescription>Customize este app e lance sua oferta.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/">Editar landing</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/billing">Ver plano e uso</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
