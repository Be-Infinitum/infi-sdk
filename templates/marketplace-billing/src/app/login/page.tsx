import { redirect } from "next/navigation";
import { getOperator } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage() {
  const op = await getOperator();
  if (op) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Marketplace billing</CardTitle>
          <CardDescription>
            Painel do operador, construído com o SDK da Infi. Cobrança por uso com preço por
            organização (rate-cards), medição de eventos e fatura por período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/api/auth/login">Entrar com Infi</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
