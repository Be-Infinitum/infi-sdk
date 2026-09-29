import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAdapters } from "./adapters.js";

vi.mock("youtube-video-element", () => ({}));
vi.mock("vimeo-video-element", () => ({}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

function loadProviderScripts() {
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event("load")));
    return node;
  });
}

describe("provider adapters", () => {
  it.each([
    ["youtube", "https://www.youtube.com/watch?v=abc"],
    ["vimeo", "https://vimeo.com/123"],
  ] as const)("%s reports HTML media events", async (provider, url) => {
    const container = document.createElement("div");
    const progress = vi.fn();
    const ended = vi.fn();
    const down = await defaultAdapters[provider](container, url, { progress, ended });
    const media = container.firstElementChild as HTMLElement & HTMLMediaElement;

    expect(media.tagName.toLowerCase()).toBe(`${provider}-video`);
    expect(media.getAttribute("src")).toBe(url);
    Object.defineProperties(media, {
      currentTime: { configurable: true, value: 91 },
      duration: { configurable: true, value: 100 },
    });
    media.dispatchEvent(new Event("timeupdate"));
    media.dispatchEvent(new Event("ended"));

    expect(progress).toHaveBeenCalledWith(91, 100);
    expect(ended).toHaveBeenCalledOnce();
    down();
    expect(container.childElementCount).toBe(0);
  });

  it("Bunny forwards player.js time and end events and detaches them", async () => {
    loadProviderScripts();
    const listeners = new Map<string, (data?: { seconds?: number; duration?: number }) => void>();
    const off = vi.fn();
    class Player {
      constructor(_frame: HTMLIFrameElement) {}
      on(event: string, callback: (data?: { seconds?: number; duration?: number }) => void) {
        listeners.set(event, callback);
      }
      off = off;
    }
    vi.stubGlobal("playerjs", { Player });

    const container = document.createElement("div");
    const progress = vi.fn();
    const ended = vi.fn();
    const down = await defaultAdapters.bunny(container, "https://iframe.mediadelivery.net/embed/1/a", {
      progress,
      ended,
    });
    listeners.get("ready")?.();
    listeners.get("timeupdate")?.({ seconds: 91, duration: 100 });
    listeners.get("ended")?.();

    expect(progress).toHaveBeenCalledWith(91, 100);
    expect(ended).toHaveBeenCalledOnce();
    down();
    expect(off).toHaveBeenCalledWith("timeupdate");
    expect(off).toHaveBeenCalledWith("ended");
    expect(container.childElementCount).toBe(0);
  });

  it("Panda forwards its time and end events and removes its frame", async () => {
    loadProviderScripts();
    let onEvent: ((event: { message?: string; currentTime?: number; duration?: number }) => void) | undefined;
    class Panda {
      constructor(_id: string, options: { onEvent?: typeof onEvent }) {
        onEvent = options.onEvent;
      }
    }
    vi.stubGlobal("PandaPlayer", Panda);

    const container = document.createElement("div");
    const progress = vi.fn();
    const ended = vi.fn();
    const down = await defaultAdapters.panda(container, "https://player.pandavideo.com.br/embed/a", {
      progress,
      ended,
    });
    onEvent?.({ message: "panda_timeupdate", currentTime: 91, duration: 100 });
    onEvent?.({ message: "panda_ended" });

    expect(progress).toHaveBeenCalledWith(91, 100);
    expect(ended).toHaveBeenCalledOnce();
    down();
    expect(container.childElementCount).toBe(0);
  });
});
