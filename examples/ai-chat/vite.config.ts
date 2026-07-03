import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SPA on :4003; the Hono API + auth run on :3012 (holds the secret keys).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4003,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3012",
      "/callback": "http://localhost:3012",
    },
  },
});
