import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser-only package: it builds URLs, mounts an iframe and talks
    // postMessage. happy-dom over jsdom for speed. Neither implements real
    // cross-origin origins, so origin rejection is tested by faking the event.
    environment: "happy-dom",
    environmentOptions: {
      // Otherwise happy-dom really fetches the iframe src and floods stderr
      // with aborted-request traces. We assert on the URL, never load it.
      happyDOM: { settings: { disableIframePageLoading: true } },
    },
  },
});
