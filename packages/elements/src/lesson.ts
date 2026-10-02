/**
 * The lesson player's rules, kept out of the per-provider adapters so every
 * provider behaves the same (spec-curso-v1): an adapter only reports
 * `progress(seconds, duration)` and `ended()`; whether that means "done" is
 * decided here, once.
 */
import type { VideoProvider } from "./portal.js";

/** A lesson is done at the end, or once ~90% has played. */
export const DEFAULT_COMPLETION_THRESHOLD = 0.9;

export interface CompletionTrackerOptions {
  /** Fraction of the duration that counts as done (0 < t ≤ 1). */
  threshold?: number;
  /** Called once per tracker, the first time the lesson counts as done. */
  onComplete: () => void;
}

export interface CompletionTracker {
  /** From the adapter, whenever the provider reports time. */
  progress(seconds: number, duration: number): void;
  /** From the adapter, when the video ends. */
  ended(): void;
  readonly completed: boolean;
  /** Furthest point watched, as a fraction (0–1). Seeking back does not lower it. */
  readonly watched: number;
}

export function createCompletionTracker(opts: CompletionTrackerOptions): CompletionTracker {
  const threshold = opts.threshold ?? DEFAULT_COMPLETION_THRESHOLD;
  if (!(threshold > 0 && threshold <= 1)) throw new RangeError("threshold must be in (0, 1]");
  let completed = false;
  let watched = 0;
  const done = () => {
    if (completed) return;
    completed = true;
    opts.onComplete();
  };
  return {
    progress(seconds, duration) {
      // A live stream or a player that has not loaded its metadata reports
      // no usable duration: nothing can be measured against it.
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds) || seconds < 0) return;
      watched = Math.max(watched, Math.min(1, seconds / duration));
      if (watched >= threshold) done();
    },
    ended: done,
    get completed() {
      return completed;
    },
    get watched() {
      return watched;
    },
  };
}

/**
 * The provider of a lesson's video link, as Infi's backend detects it. The
 * backend's answer (`lesson.video.provider`) wins; this is for links a
 * template renders on its own.
 */
export function detectVideoProvider(link: string): VideoProvider {
  let host: string;
  try {
    const u = new URL(link);
    if (u.protocol !== "https:") return "other";
    host = u.hostname.toLowerCase();
  } catch {
    return "other";
  }
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (is("youtube.com") || is("youtu.be") || is("youtube-nocookie.com")) return "youtube";
  if (is("vimeo.com")) return "vimeo";
  if (is("pandavideo.com.br") || is("pandavideo.com")) return "panda";
  if (is("mediadelivery.net") || is("bunnycdn.com") || is("b-cdn.net")) return "bunny";
  return "other";
}
