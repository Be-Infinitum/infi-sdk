import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/infi";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.onboardingComplete ? "/dashboard" : "/onboarding");
  }

  const { error, message } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>
            Entre com Infi — login hosted, sessão segura e billing integrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message || "Não foi possível entrar. Tente novamente."}
            </p>
          ) : null}
          <Button asChild className="w-full">
            <a href="/api/auth/login">Entrar com Infi</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
