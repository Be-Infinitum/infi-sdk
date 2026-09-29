import { describe, expect, it, vi } from "vitest";
import { createCompletionTracker, detectVideoProvider } from "./lesson.js";

describe("createCompletionTracker", () => {
  it("counts a lesson done at 90% and only once", () => {
    const onComplete = vi.fn();
    const t = createCompletionTracker({ onComplete });
    t.progress(30, 100);
    expect(t.completed).toBe(false);
    t.progress(90, 100);
    t.progress(95, 100);
    t.ended();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(t.completed).toBe(true);
  });

  it("counts the end as done even when time was never reported (YouTube polling missed it)", () => {
    const onComplete = vi.fn();
    createCompletionTracker({ onComplete }).ended();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("keeps the furthest point watched: seeking back does not undo it", () => {
    const t = createCompletionTracker({ onComplete: () => {}, threshold: 0.95 });
    t.progress(80, 100);
    t.progress(10, 100);
    expect(t.watched).toBe(0.8);
  });

  it("ignores a player with no duration yet", () => {
    const onComplete = vi.fn();
    const t = createCompletionTracker({ onComplete });
    t.progress(10, 0);
    t.progress(10, Number.NaN);
    t.progress(Number.POSITIVE_INFINITY, 100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(t.watched).toBe(0);
  });

  it("refuses a threshold outside (0, 1]", () => {
    expect(() => createCompletionTracker({ onComplete: () => {}, threshold: 0 })).toThrow(RangeError);
    expect(() => createCompletionTracker({ onComplete: () => {}, threshold: 1.5 })).toThrow(RangeError);
  });
});

describe("detectVideoProvider", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://player.vimeo.com/video/1", "vimeo"],
    ["https://player-vz-1.tv.pandavideo.com.br/embed/?v=x", "panda"],
    ["https://iframe.mediadelivery.net/embed/1/abc", "bunny"],
    ["https://notvimeo.com/1", "other"],
    ["http://vimeo.com/1", "other"],
    ["não é link", "other"],
  ])("%s → %s", (link, provider) => {
    expect(detectVideoProvider(link)).toBe(provider);
  });
});
