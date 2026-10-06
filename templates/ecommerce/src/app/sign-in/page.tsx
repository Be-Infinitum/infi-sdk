import { redirect } from "next/navigation";
import { SignIn } from "@/components/sign-in";
import { getBuyer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_a_customer: "Esta loja só deixa entrar quem já comprou aqui.",
  access_denied: "O login foi cancelado.",
};

/** "Entrar com Infi". `?next=/members` comes back there. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; infi_error?: string }> }) {
  const { next, infi_error: error } = await searchParams;
  // Only a path on this site: an absolute URL here would be an open redirect.
  const back = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getBuyer()) redirect(back);
  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 pt-16 pb-20 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Use sua conta Infi. Se é a primeira vez, ela é criada com seu e-mail.</p>
      </div>
      <SignIn redirectTo={back} />
      {error ? <p className="text-sm text-red-600">{ERRORS[error] ?? "Não foi possível entrar. Tente de novo."}</p> : null}
    </main>
  );
}
