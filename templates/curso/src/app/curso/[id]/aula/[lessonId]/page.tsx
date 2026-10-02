import { endedMessage } from "@beinfi/elements-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { LessonView } from "@/components/lesson-view";
import { memberPortal, notFoundError, sessionEnded } from "@/lib/member";

export const dynamic = "force-dynamic";

/**
 * One lesson, rendered on THIS server. The video link and the text exist only
 * when Infi's API released them for this student (state "available"); a
 * locked or unowned lesson comes back with its state alone, so this page
 * cannot render content to someone without access, whatever the browser does.
 * The video itself is protected by domain restriction on your provider
 * (GUIA-VIDEO.md).
 */
export default async function LessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  const portal = await memberPortal();
  if (!portal) redirect("/membros");
  const fail = (err: unknown): never => {
    if (sessionEnded(err)) redirect("/membros");
    if (notFoundError(err)) notFound();
    throw err;
  };
  const [lesson, course] = await Promise.all([portal.lesson(id, lessonId), portal.course(id)]).catch(fail);

  const ordered = (course.modules ?? []).flatMap((m) => m.lessons);
  const at = ordered.findIndex((l) => l.id === lessonId);
  const next = ordered.slice(at + 1).find((l) => l.state === "available");

  return (
    <main className="mx-auto max-w-4xl px-6 pb-20">
      <Link href={`/curso/${course.id}`} className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{lesson.title}</h1>

      {lesson.state === "no_access" ? (
        <div className="mt-8 rounded-xl border border-border p-6">
          <p>{endedMessage(course.access.endedReason)}</p>
          <Link href="/" className="mt-3 inline-block underline">
            Ver planos
          </Link>
        </div>
      ) : null}
      {lesson.state === "locked" ? (
        <div className="mt-8 rounded-xl border border-border p-6">
          <p>
            Esta aula libera em{" "}
            {lesson.unlocksAt
              ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date(lesson.unlocksAt))
              : "breve"}
            .
          </p>
        </div>
      ) : null}
      {lesson.state === "available" ? (
        <div className="mt-6">
          <LessonView courseId={course.id} lessonId={lesson.id} video={lesson.video} completed={lesson.completed} />
          {lesson.bodyMarkdown ? (
            <article className="lesson-text mt-8 space-y-4 leading-relaxed">
              <ReactMarkdown>{lesson.bodyMarkdown}</ReactMarkdown>
            </article>
          ) : null}
          {next ? (
            <Link href={`/curso/${course.id}/aula/${next.id}`} className="mt-8 inline-block underline">
              Próxima aula: {next.title} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
