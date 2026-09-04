import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as const,
  dts: true,
  sourcemap: true,
  external: ["react", "react-dom"],
  target: "es2022" as const,
};

// Two configs because `banner` is config-global and only the React entry may
// carry "use client" — the core must stay importable from a server bundle.
//
// `clean` is in NEITHER: tsup 8.5.1 runs array configs with Promise.all
// (dist/index.js:1494), so a clean in either one races the other's output into
// the same dist/. The build script does `rm -rf dist` once, before tsup.
export default defineConfig([
  { ...shared, entry: { index: "src/index.ts" } },
  {
    ...shared,
    entry: { "react/index": "src/react/index.ts" },
    // esbuild strips directives from source. Verified: without this banner the
    // published file has no "use client" and the component breaks in an RSC tree.
    banner: { js: '"use client";' },
  },
]);
