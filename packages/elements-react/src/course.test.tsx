import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortalCourse } from "@beinfi/elements";
import { CourseElement, LessonPlayer, daysUntil, type PlayerAdapter, type PlayerEvents } from "./index.js";

afterEach(() => cleanup());

const inThreeDays = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();

const course = (over: Partial<PortalCourse> = {}): PortalCourse => ({
  id: "c1",
  title: "Precificação",
  access: { key: "curso-x", name: "Curso", hasAccess: true, state: "active", since: "2026-09-01T00:00:00Z" },
  progress: { completed: 1, total: 3, percent: 33 },
  continue: { lessonId: "l2", moduleId: "m1", title: "Leitura" },
  modules: [
    {
      id: "m1",
      title: "Fundamentos",
      lessons: [
        { id: "l1", moduleId: "m1", title: "Boas-vindas", position: 1, state: "available", hasVideo: true, hasText: false, completed: true },
        { id: "l2", moduleId: "m1", title: "Leitura", position: 2, state: "available", hasVideo: false, hasText: true, completed: false },
        { id: "l3", moduleId: "m1", title: "Semana dois", position: 3, state: "locked", unlocksAt: inThreeDays, hasVideo: true, hasText: false, completed: false },
      ],
    },
  ],
  ...over,
});

const href = (l: { id: string }) => `/aula/${l.id}`;

describe("CourseElement", () => {
  it("links available lessons, shows when a locked one unlocks, and where to continue", () => {
    render(<CourseElement course={course()} lessonHref={href} />);
    expect(screen.getByText("Boas-vindas").getAttribute("href")).toBe("/aula/l1");
    expect(screen.getByText("Semana dois").closest("a")).toBeNull();
    expect(screen.getByText(/Libera em 3 dias/)).toBeTruthy();
    expect(screen.getByText(/Continuar: Leitura/).getAttribute("href")).toBe("/aula/l2");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("warns a past-due member who still has access, and tells an ended one why, with a way back", () => {
    const { rerender } = render(
      <CourseElement course={course({ access: { key: "k", name: "n", hasAccess: true, state: "past_due" } })} lessonHref={href} payHref="/minhas-compras" />,
    );
    expect(screen.getByRole("alert").textContent).toContain("em atraso");
    rerender(
      <CourseElement
        course={course({ access: { key: "k", name: "n", hasAccess: false, state: "ended", endedReason: "subscription_canceled" } })}
        lessonHref={href}
        renewHref="/assinar"
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("assinatura foi cancelada");
    expect(screen.getByText("Renovar acesso").getAttribute("href")).toBe("/assinar");
    expect(screen.queryByText(/Continuar/)).toBeNull();
  });

  it("counts drip days up from now", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    expect(daysUntil("2026-10-01T11:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-09-20T00:00:00Z", now)).toBe(0);
  });
});

describe("LessonPlayer", () => {
  function fakeAdapter() {
    const state: { events?: PlayerEvents; url?: string; down: ReturnType<typeof vi.fn> } = { down: vi.fn() };
    const adapter: PlayerAdapter = async (_el, url, events) => {
      state.events = events;
      state.url = url;
      return state.down;
    };
    return { adapter, state };
  }

  it("picks the adapter by provider and marks the lesson done once, past 90%", async () => {
    const { adapter, state } = fakeAdapter();
    const onComplete = vi.fn();
    render(<LessonPlayer video={{ url: "https://vimeo.com/1", provider: "vimeo" }} adapters={{ vimeo: adapter }} onComplete={onComplete} />);
    await waitFor(() => expect(state.events).toBeDefined());
    expect(state.url).toBe("https://vimeo.com/1");
    act(() => {
      state.events!.progress(50, 100);
      state.events!.progress(91, 100);
      state.events!.ended();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("detects the provider from the link when the API did not say, and tears the player down", async () => {
    const { adapter, state } = fakeAdapter();
    const { container, unmount } = render(
      <LessonPlayer video={{ url: "https://iframe.mediadelivery.net/embed/1/abc" }} adapters={{ bunny: adapter }} />,
    );
    await waitFor(() => expect(state.events).toBeDefined());
    expect(container.querySelector("[data-infi-lesson-player]")!.getAttribute("data-infi-lesson-player")).toBe("bunny");
    unmount();
    expect(state.down).toHaveBeenCalledOnce();
  });

  it("shows the fallback when the provider's player cannot load", async () => {
    const broken: PlayerAdapter = async () => {
      throw new Error("blocked");
    };
    render(<LessonPlayer video={{ url: "https://youtu.be/x", provider: "youtube" }} adapters={{ youtube: broken }} fallback={<p>sem vídeo</p>} />);
    await waitFor(() => expect(screen.getByText("sem vídeo")).toBeTruthy());
  });
});
