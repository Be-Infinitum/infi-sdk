import { NextResponse } from "next/server";
import { memberPortal, sessionEnded } from "@/lib/member";

/**
 * Marks a lesson done (or not) for the signed-in student. Infi refuses a
 * lesson they cannot watch yet (403), so a forged request unlocks nothing.
 */
export async function POST(req: Request) {
  const portal = await memberPortal();
  if (!portal) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const { courseId, lessonId, done } = (await req.json()) as { courseId?: string; lessonId?: string; done?: boolean };
  if (!courseId || !lessonId) return NextResponse.json({ error: "courseId and lessonId are required" }, { status: 400 });
  try {
    const course = done === false ? await portal.uncompleteLesson(courseId, lessonId) : await portal.completeLesson(courseId, lessonId);
    return NextResponse.json({ progress: course.progress, continue: course.continue ?? null });
  } catch (err) {
    if (sessionEnded(err)) return NextResponse.json({ error: "signed out" }, { status: 401 });
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: "could not save progress" }, { status: status >= 400 && status < 500 ? status : 502 });
  }
}
