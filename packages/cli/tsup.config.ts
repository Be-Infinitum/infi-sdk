import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/parse.ts",
    "src/lib/provision.ts",
    "src/lib/claim.ts",
    "src/commands/init.ts",
    "src/commands/doctor.ts",
  ],
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
