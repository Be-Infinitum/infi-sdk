import { redirect } from "next/navigation";
import { requireUser, completeOnboarding } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME, STARTER_CREDITS } from "@/lib/infi";

async function finishOnboarding() {
  "use server";
  const user = await requireUser();
  await completeOnboarding(user.id);
  redirect("/dashboard");
}

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingComplete) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bem-vindo ao {APP_NAME}</CardTitle>
          <CardDescription>
            Seu plano starter inclui {STARTER_CREDITS} créditos para começar. Use o dashboard
            para acompanhar saldo e comprar mais quando precisar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={finishOnboarding}>
            <Button type="submit" className="w-full">
              Ir para o dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
