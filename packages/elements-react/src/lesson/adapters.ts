import type { VideoProvider } from "@beinfi/elements";

/**
 * What every provider adapter reports, and all it reports. Whether that means
 * the lesson is done is decided outside the adapters
 * (`createCompletionTracker` in @beinfi/elements), so every provider behaves
 * the same.
 */
export interface PlayerEvents {
  progress(seconds: number, duration: number): void;
  ended(): void;
}

/**
 * Mounts one provider's player inside `container` and returns how to take it
 * down. Everything runs in the browser: the video stays on the merchant's own
 * provider, protected there by domain restriction.
 */
export type PlayerAdapter = (
  container: HTMLElement,
  url: string,
  events: PlayerEvents,
) => Promise<() => void>;

// Media elements (Mux): the HTMLMediaElement API over YouTube and Vimeo, so
// `timeupdate` and `ended` exist even where the provider's own API has none
// (YouTube's IFrame API has no timeupdate; the element polls for us).
function mediaElement(tag: "youtube-video" | "vimeo-video", load: () => Promise<unknown>): PlayerAdapter {
  return async (container, url, events) => {
    await load();
    const el = document.createElement(tag) as HTMLElement & HTMLMediaElement;
    el.setAttribute("src", url);
    el.setAttribute("controls", "");
    el.setAttribute("playsinline", "");
    el.style.width = "100%";
    el.style.aspectRatio = "16 / 9";
    const onTime = () => events.progress(el.currentTime, el.duration);
    const onEnded = () => events.ended();
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    container.appendChild(el);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      el.remove();
    };
  };
}

const scripts = new Map<string, Promise<void>>();

/** Loads a provider's script once per page. */
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        reject(new Error(`could not load ${src}`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

function iframe(container: HTMLElement, src: string, id?: string): HTMLIFrameElement {
  const f = document.createElement("iframe");
  f.src = src;
  if (id) f.id = id;
  f.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen";
  f.allowFullscreen = true;
  f.style.width = "100%";
  f.style.aspectRatio = "16 / 9";
  f.style.border = "0";
  container.appendChild(f);
  return f;
}

type PlayerJS = { on(event: string, cb: (data?: { seconds?: number; duration?: number }) => void): void; off?(event: string): void };

// Bunny Stream: the embed speaks player.js.
const bunny: PlayerAdapter = async (container, url, events) => {
  await loadScript("https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js");
  const frame = iframe(container, url);
  const ns = (globalThis as unknown as { playerjs?: { Player: new (el: HTMLIFrameElement) => PlayerJS } }).playerjs;
  if (!ns) throw new Error("player.js did not load");
  const player = new ns.Player(frame);
  player.on("ready", () => {
    player.on("timeupdate", (d) => events.progress(d?.seconds ?? 0, d?.duration ?? 0));
    player.on("ended", () => events.ended());
  });
  return () => {
    player.off?.("timeupdate");
    player.off?.("ended");
    frame.remove();
  };
};

type PandaEvent = { message?: string; currentTime?: number; duration?: number };
type PandaCtor = new (id: string, opts: { onReady?: () => void; onEvent?: (e: PandaEvent) => void }) => unknown;

// Panda Video: its PandaPlayer API. panda_timeupdate carries the time; the
// name of its end event was not in the docs we read (pesquisa/area-de-membros-
// ui.md), so both known spellings are taken and the 90% rule does not depend
// on it.
const panda: PlayerAdapter = async (container, url, events) => {
  await loadScript("https://player.pandavideo.com.br/api.v2.js");
  const id = `panda-${Math.random().toString(36).slice(2)}`;
  const frame = iframe(container, url, id);
  const Panda = (globalThis as unknown as { PandaPlayer?: PandaCtor }).PandaPlayer;
  if (!Panda) throw new Error("PandaPlayer did not load");
  let duration = 0;
  new Panda(id, {
    onEvent: (e) => {
      if (typeof e.duration === "number") duration = e.duration;
      if (e.message === "panda_timeupdate") events.progress(e.currentTime ?? 0, e.duration ?? duration);
      if (e.message === "panda_ended" || e.message === "panda_end") events.ended();
    },
  });
  return () => frame.remove();
};

// Anything else: a direct file plays in <video> with the same events; an
// embed we have no API for plays as it is, and the student marks it done.
const other: PlayerAdapter = async (container, url, events) => {
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url)) {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.playsInline = true;
    v.style.width = "100%";
    const onTime = () => events.progress(v.currentTime, v.duration);
    const onEnded = () => events.ended();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    container.appendChild(v);
    return () => v.remove();
  }
  const frame = iframe(container, url);
  return () => frame.remove();
};

export const defaultAdapters: Record<VideoProvider, PlayerAdapter> = {
  youtube: mediaElement("youtube-video", () => import("youtube-video-element")),
  vimeo: mediaElement("vimeo-video", () => import("vimeo-video-element")),
  bunny,
  panda,
  other,
};
