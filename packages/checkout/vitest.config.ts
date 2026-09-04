import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser-only package: it builds URLs, mounts an iframe and talks
    // postMessage. happy-dom over jsdom for speed. Neither implements real
    // cross-origin origins, so origin rejection is tested by faking the event.
    environment: "happy-dom",
    environmentOptions: {
      // Otherwise happy-dom really fetches every iframe src and floods stderr
      // with aborted-request traces, which hides real failures. We assert on
      // the URL, never load it. `disableIframePageLoading` is deprecated in
      // happy-dom 15 — this is the key it forwards to.
      happyDOM: { settings: { navigation: { disableChildFrameNavigation: true } } },
    },
  },
});
