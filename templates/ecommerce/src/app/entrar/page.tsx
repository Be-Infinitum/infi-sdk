import { redirect } from "next/navigation";
import { SignIn } from "@/components/sign-in";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sign in with an e-mailed code. `?next=/clube` comes back there. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only a path on this site: an absolute URL here would be an open redirect.
  const back = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await auth.getBuyer()) redirect(back);
  return (
    <main className="mx-auto flex max-w-sm flex-col px-6 pt-10 pb-20">
      <SignIn redirectTo={back} />
    </main>
  );
}
