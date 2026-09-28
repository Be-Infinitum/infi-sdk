import type { PortalCourse, PortalLesson } from "@beinfi/elements";
import type { CSSProperties, ReactNode } from "react";

export interface CourseElementProps {
  /**
   * The course, read on YOUR server with the student's buyer token
   * (`createPortalClient(...).course(id)` from @beinfi/elements). Infi decides
   * there what is available, locked or not owned; this only shows it.
   */
  course: PortalCourse;
  /** Where a lesson opens (your server-rendered lesson page). */
  lessonHref: (lesson: Pick<PortalLesson, "id" | "moduleId">) => string;
  /** Where to renew or buy when the access ended (your product page). */
  renewHref?: string;
  /** Where to pay a late bill (your "Minhas compras"). */
  payHref?: string;
  /** Replace a lesson row entirely. */
  renderLesson?: (lesson: PortalLesson, defaults: { href: string; label: string }) => ReactNode;
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

function day(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(iso));
}

/** How far a drip date is, in whole days from now ("libera em 3 dias"). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

function lessonLabel(l: PortalLesson, locale: string): string {
  if (l.state === "locked" && l.unlocksAt) {
    const n = daysUntil(l.unlocksAt);
    return n <= 1 ? `Libera amanhã (${day(l.unlocksAt, locale)})` : `Libera em ${n} dias (${day(l.unlocksAt, locale)})`;
  }
  if (l.state === "no_access") return "Sem acesso";
  return l.completed ? "Concluída" : l.hasVideo ? "Vídeo" : "Leitura";
}

/**
 * A course's outline for the member area: progress, "continue", modules and
 * lessons with their state. Styled by CSS variables (`--infi-accent`,
 * `--infi-muted`, `--infi-border`, `--infi-radius`) and plain classes
 * (`infi-course`, `infi-course-lesson`, …) so your CSS wins.
 */
export function CourseElement({
  course,
  lessonHref,
  renewHref,
  payHref,
  renderLesson,
  locale = "pt-BR",
  className,
  style,
}: CourseElementProps) {
  const { access, progress } = course;
  return (
    <section className={["infi-course", className].filter(Boolean).join(" ")} style={style}>
      {access.state === "past_due" ? (
        <div role="alert" className="infi-course-banner infi-course-banner-warning" style={banner("#fef3c7")}>
          Sua assinatura está em atraso. Você continua com acesso — pague para não perder.
          {payHref ? <a href={payHref} style={{ marginLeft: 8 }}>Pagar agora</a> : null}
        </div>
      ) : null}
      {!access.hasAccess ? (
        <div role="alert" className="infi-course-banner infi-course-banner-ended" style={banner("#fee2e2")}>
          {endedMessage(access.endedReason)}
          {renewHref ? <a href={renewHref} style={{ marginLeft: 8 }}>Renovar acesso</a> : null}
        </div>
      ) : null}
      <div className="infi-course-progress" style={{ margin: "1rem 0" }}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label="Progresso do curso"
          style={{ height: 6, borderRadius: 999, background: "var(--infi-border, #e4e4e7)" }}
        >
          <div style={{ width: `${progress.percent}%`, height: "100%", borderRadius: 999, background: "var(--infi-accent, #0a0a0a)" }} />
        </div>
        <small style={{ color: "var(--infi-muted, #71717a)" }}>
          {progress.completed} de {progress.total} aulas
        </small>
      </div>
      {course.continue && access.hasAccess ? (
        <a
          className="infi-course-continue"
          href={lessonHref({ id: course.continue.lessonId, moduleId: course.continue.moduleId })}
          style={{
            display: "inline-block",
            padding: "0.625rem 1rem",
            borderRadius: "var(--infi-radius, 12px)",
            background: "var(--infi-accent, #0a0a0a)",
            color: "var(--infi-accent-foreground, #fff)",
            textDecoration: "none",
          }}
        >
          Continuar: {course.continue.title}
        </a>
      ) : null}
      {(course.modules ?? []).map((m) => (
        <div key={m.id} className="infi-course-module" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.5rem" }}>{m.title}</h3>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {m.lessons.map((l) => {
              const href = lessonHref(l);
              const label = lessonLabel(l, locale);
              if (renderLesson) return <li key={l.id}>{renderLesson(l, { href, label })}</li>;
              const open = l.state === "available";
              return (
                <li
                  key={l.id}
                  className="infi-course-lesson"
                  data-state={l.state}
                  data-completed={l.completed || undefined}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.625rem 0",
                    borderBottom: "1px solid var(--infi-border, #e4e4e7)",
                    opacity: open ? 1 : 0.6,
                  }}
                >
                  {open ? <a href={href}>{l.title}</a> : <span aria-disabled="true">{l.title}</span>}
                  <small style={{ color: "var(--infi-muted, #71717a)" }}>{label}</small>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

function banner(bg: string): CSSProperties {
  return { padding: "0.75rem 1rem", borderRadius: "var(--infi-radius, 12px)", background: bg, color: "#18181b" };
}

/** Why the access ended, as the student reads it. */
export function endedMessage(reason?: string): string {
  switch (reason) {
    case "expired":
      return "Seu período de acesso terminou.";
    case "refunded":
      return "O acesso foi encerrado porque a compra foi estornada.";
    case "charged_back":
      return "O acesso foi encerrado por uma contestação no cartão.";
    case "subscription_canceled":
      return "Sua assinatura foi cancelada e o acesso terminou.";
    case undefined:
    case "":
      return "Você ainda não tem acesso a este curso.";
  }
  return "Seu acesso a este curso terminou.";
}
