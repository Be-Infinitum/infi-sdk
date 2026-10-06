import type { PortalCommunity, PortalCourse } from "@beinfi/elements";
import Link from "next/link";
import { CourseRow } from "@/components/course-row";
import { MemberLogin } from "@/components/member-login";
import { memberPortal, sessionEnded } from "@/lib/member";

export const dynamic = "force-dynamic";

/**
 * The member area, Netflix-style: a hero with where to continue, then rows —
 * continue watching, your courses, the ones you do not have yet. Read on this
 * server with the student's token; nothing here decides access on its own.
 */
export default async function MembersPage() {
  const portal = await memberPortal();
  if (!portal) return <Login />;
  let courses: PortalCourse[];
  let communities: PortalCommunity[] = [];
  try {
    [courses, communities] = await Promise.all([portal.courses(), portal.communities()]);
  } catch (err) {
    if (sessionEnded(err)) return <Login expired />;
    throw err;
  }
  const owned = courses.filter((c) => c.access.hasAccess);
  const continuing = owned.filter((c) => c.continue && c.progress.completed > 0);
  const locked = courses.filter((c) => !c.access.hasAccess);
  const hero = continuing[0] ?? owned[0];
  const pastDue = owned.some((c) => c.access.state === "past_due");

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20">
      {pastDue ? (
        <div role="alert" className="mt-6 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950">
          Sua assinatura está em atraso. Você continua com acesso — <Link href="/minhas-compras" className="underline">pague aqui</Link> para não perder.
        </div>
      ) : null}
      {hero ? (
        <section className="relative mt-6 overflow-hidden rounded-2xl bg-muted">
          {hero.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          ) : null}
          <div className="relative px-8 py-16 md:py-24">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight">{hero.title}</h1>
            {hero.description ? <p className="mt-3 max-w-xl text-muted-foreground">{hero.description}</p> : null}
            <div className="mt-6 flex gap-3">
              {hero.continue ? (
                <Link
                  href={`/curso/${hero.id}/aula/${hero.continue.lessonId}`}
                  className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
                >
                  {hero.progress.completed > 0 ? "Continuar" : "Começar"}: {hero.continue.title}
                </Link>
              ) : null}
              <Link href={`/curso/${hero.id}`} className="rounded-md border border-border px-5 py-2.5 text-sm">
                Ver aulas
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-10">
          <h1 className="text-3xl font-semibold">Área de membros</h1>
          <p className="mt-2 text-muted-foreground">
            Você ainda não tem acesso a um curso. <Link href="/" className="underline">Veja os planos</Link>.
          </p>
        </section>
      )}
      <CourseRow title="Continuar assistindo" courses={continuing} mode="continue" />
      <CourseRow title="Seus cursos" courses={owned} mode="owned" />
      <CourseRow title="Você ainda não tem" courses={locked} mode="locked" />
      <Communities communities={communities} />
    </main>
  );
}

function Login({ expired }: { expired?: boolean }) {
  return (
    <main className="mx-auto max-w-xl px-6 pb-20">
      <h1 className="mt-10 text-3xl font-semibold">Entrar na área de membros</h1>
      <p className="mt-2 text-muted-foreground">
        {expired ? "Sua sessão terminou. " : ""}Use o e-mail da compra: enviamos um código de 6 dígitos.
      </p>
      <div className="mt-8">
        <MemberLogin expired={expired} />
      </div>
    </main>
  );
}

/** The student's own invites. The e-mail carries them too; here they are never lost. */
function Communities({ communities }: { communities: PortalCommunity[] }) {
  const live = communities.filter((c) => c.status !== "removed");
  if (live.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-3 text-lg font-semibold">Comunidade</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {live.map((c) => (
          <li key={`${c.provider}-${c.accessKey}`} className="rounded-xl border border-border p-4">
            <p className="font-medium">
              {c.title ?? (c.provider === "telegram" ? "Grupo no Telegram" : "Servidor no Discord")}
            </p>
            {c.provider === "telegram" && c.inviteLink ? (
              <a href={c.inviteLink} className="mt-2 inline-block text-sm underline" rel="noopener noreferrer" target="_blank">
                Entrar no grupo (convite só seu, vale uma vez)
              </a>
            ) : null}
            {c.provider === "telegram" && c.status === "joined" ? <p className="mt-2 text-sm text-muted-foreground">Você já está no grupo.</p> : null}
            {c.provider === "discord" && c.needsAccount ? (
              <Link href="/membros/discord" className="mt-2 inline-block text-sm underline">
                Conectar sua conta do Discord
              </Link>
            ) : null}
            {c.provider === "discord" && c.inviteUrl ? (
              <a href={c.inviteUrl} className="mt-2 block text-sm underline" rel="noopener noreferrer" target="_blank">
                Entrar no servidor
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
