import { CourseElement } from "@beinfi/elements-react";
import { notFound, redirect } from "next/navigation";
import { memberPortal, notFoundError, sessionEnded } from "@/lib/member";

export const dynamic = "force-dynamic";

/** The course's outline: what is available, what unlocks when, where to continue. */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portal = await memberPortal();
  if (!portal) redirect("/membros");
  const course = await portal.course(id).catch((err: unknown) => {
    if (sessionEnded(err)) redirect("/membros");
    if (notFoundError(err)) notFound();
    throw err;
  });
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{course.title}</h1>
      {course.description ? <p className="mt-2 text-muted-foreground">{course.description}</p> : null}
      <CourseElement
        course={course}
        lessonHref={(l) => `/curso/${course.id}/aula/${l.id}`}
        renewHref="/"
        payHref="/minhas-compras"
        className="mt-6"
      />
    </main>
  );
}
