"use client";

import { LessonPlayer } from "@beinfi/elements-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The player and the "done" button of one available lesson. A video lesson
 * marks itself done at the end or past ~90% (the rule lives in
 * @beinfi/elements, the same for every provider); a text lesson is marked by
 * the student.
 */
export function LessonView(props: {
  courseId: string;
  lessonId: string;
  video?: { url: string; provider: "youtube" | "vimeo" | "panda" | "bunny" | "other" };
  completed: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(props.completed);
  const [saving, setSaving] = useState(false);

  async function save(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/progresso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: props.courseId, lessonId: props.lessonId, done: next }),
      });
      if (res.status === 401) return router.push("/membros");
      if (res.ok) {
        setDone(next);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {props.video ? (
        <LessonPlayer
          video={props.video}
          className="overflow-hidden rounded-xl bg-black"
          onComplete={() => {
            if (!done) void save(true);
          }}
        />
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <Button variant={done ? "outline" : "default"} disabled={saving} onClick={() => void save(!done)}>
          {done ? "Concluída ✓ (desmarcar)" : "Marcar como concluída"}
        </Button>
      </div>
    </div>
  );
}
