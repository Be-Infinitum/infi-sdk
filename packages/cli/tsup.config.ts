import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/parse.ts", "src/lib/provision.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
