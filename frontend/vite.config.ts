import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // No data: URIs — CSP allows fonts/images only from our own origin (Caddyfile).
  build: { assetsInlineLimit: 0 },
  server: { proxy: { "/api": "http://127.0.0.1:8000", "/admin": "http://127.0.0.1:8000", "/static": "http://127.0.0.1:8000" } },
});
