import { defineConfig } from "tsup";

// "use client": every export here mounts an iframe or holds state, and an RSC
// tree must be told so. esbuild strips directives from source, hence the banner.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  target: "es2022",
  external: ["react", "react-dom", "@beinfi/elements", "youtube-video-element", "vimeo-video-element"],
  banner: { js: '"use client";' },
});
