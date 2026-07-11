import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the StudyMind web shell (Wave 1 scaffold).
// Business modules (T09-T15) are implemented later; this only provides the
// build/dev server and the API client base URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
});
