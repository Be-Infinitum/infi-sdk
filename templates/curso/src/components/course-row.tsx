"use client";

import type { PortalCourse } from "@beinfi/elements";
import Link from "next/link";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

/**
 * One Netflix-style row. The cards come from the server (the page read them
 * with the student's token); the carousel only hydrates the drag.
 */
export function CourseRow({ title, courses, mode }: { title: string; courses: PortalCourse[]; mode: "continue" | "owned" | "locked" }) {
  if (courses.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <Carousel opts={{ align: "start", dragFree: true, slidesToScroll: "auto", containScroll: "trimSnaps" }} className="md:mx-12">
        <CarouselContent>
          {courses.map((c) => (
            <CarouselItem key={`${mode}-${c.id}`} className="basis-2/3 sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
              <CourseCard course={c} mode={mode} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden md:flex" />
        <CarouselNext className="hidden md:flex" />
      </Carousel>
    </section>
  );
}

function CourseCard({ course, mode }: { course: PortalCourse; mode: "continue" | "owned" | "locked" }) {
  const href =
    mode === "continue" && course.continue
      ? `/curso/${course.id}/aula/${course.continue.lessonId}`
      : mode === "locked"
        ? "/"
        : `/curso/${course.id}`;
  return (
    <Link href={href} className="group block overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video bg-muted">
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">{course.title}</div>
        )}
        {mode === "locked" ? (
          <span className="absolute right-2 top-2 rounded bg-background/80 px-2 py-0.5 text-xs">Sem acesso</span>
        ) : null}
        {course.progress.percent > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-border">
            <div className="h-full bg-red-600" style={{ width: `${course.progress.percent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <p className="font-medium leading-tight">{course.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "continue" && course.continue
            ? `Continuar: ${course.continue.title}`
            : mode === "locked"
              ? "Veja os planos"
              : `${course.progress.completed} de ${course.progress.total} aulas`}
        </p>
      </div>
    </Link>
  );
}
