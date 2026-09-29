import { createCompletionTracker, detectVideoProvider, type VideoProvider } from "@beinfi/elements";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { defaultAdapters, type PlayerAdapter } from "./adapters.js";

export interface LessonPlayerProps {
  /** The lesson's video as Infi's API released it (`lesson.video`). */
  video: { url: string; provider?: VideoProvider };
  /** Called once, when the lesson counts as done: at the end, or past `threshold`. */
  onComplete?: () => void;
  /** Every time report, for your own progress bar. */
  onProgress?: (seconds: number, duration: number) => void;
  /** Fraction that counts as done; 0.9 by default. */
  threshold?: number;
  /** Replace or add a provider's adapter (tests, a provider Infi does not know). */
  adapters?: Partial<Record<VideoProvider, PlayerAdapter>>;
  /** Shown if the provider's player could not load. */
  fallback?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * One player for every provider (YouTube, Vimeo, Bunny, Panda): an adapter
 * per provider, and the "done" rule outside them, so the experience does not
 * change from lesson to lesson. Client-only: render it in a page whose server
 * already checked the student may watch (the API never releases the link
 * otherwise).
 */
export function LessonPlayer(props: LessonPlayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failed, setFailed] = useState(false);
  const provider = props.video.provider ?? detectVideoProvider(props.video.url);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setFailed(false);
    let teardown: (() => void) | undefined;
    let gone = false;
    const tracker = createCompletionTracker({
      threshold: latest.current.threshold,
      onComplete: () => latest.current.onComplete?.(),
    });
    const adapter = latest.current.adapters?.[provider] ?? defaultAdapters[provider];
    adapter(el, props.video.url, {
      progress: (s, d) => {
        latest.current.onProgress?.(s, d);
        tracker.progress(s, d);
      },
      ended: () => tracker.ended(),
    }).then(
      (down) => {
        if (gone) down();
        else teardown = down;
      },
      () => {
        if (!gone) setFailed(true);
      },
    );
    return () => {
      gone = true;
      teardown?.();
    };
  }, [provider, props.video.url]);

  return (
    <div className={props.className} style={props.style} data-infi-lesson-player={provider}>
      <div ref={host} />
      {failed ? (props.fallback ?? <p>Não foi possível carregar o vídeo. Recarregue a página.</p>) : null}
    </div>
  );
}
