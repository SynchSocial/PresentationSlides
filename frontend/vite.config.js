import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_API_URL points the app at the backend. In dev we also proxy /api ->
// :8787 as a fallback so it works even with VITE_API_URL unset.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
