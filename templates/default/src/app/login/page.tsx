import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { APP_NAME, APP_ORIGIN, PUBLIC_API_URL, SLUG } from "@/lib/infi";

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
    <main className="grid min-h-svh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 lg:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <BrandMark variant="light" />
            {APP_NAME}
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1.5 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
              <p className="text-sm text-muted-foreground">
                Entre com seu email. Enviamos um código de acesso.
              </p>
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {message || "Não foi possível entrar. Tente novamente."}
              </p>
            ) : null}

            <LoginForm slug={SLUG} baseUrl={PUBLIC_API_URL} redirectTo={`${APP_ORIGIN}/callback`} />

            <p className="text-center text-xs text-muted-foreground">
              Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
            </p>
          </div>
        </div>
      </div>

      {/* Brand side */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 font-medium">
          <BrandMark variant="dark" />
          {APP_NAME}
        </div>

        <div className="space-y-6">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Tudo pronto pra cobrar: auth, checkout e medição de uso.
          </h2>
          <ul className="space-y-3 text-sm text-primary-foreground/80">
            <Feature>Login por código, sem senha pra gerenciar.</Feature>
            <Feature>Checkout e assinaturas prontos.</Feature>
            <Feature>Créditos e medição de uso por evento.</Feature>
          </ul>
        </div>

        <p className="text-sm text-primary-foreground/60">Powered by Infi</p>
      </div>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function BrandMark({ variant }: { variant: "light" | "dark" }) {
  const box =
    variant === "light"
      ? "bg-primary text-primary-foreground"
      : "bg-primary-foreground text-primary";
  return (
    <span className={`flex size-6 items-center justify-center rounded-md ${box}`}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
