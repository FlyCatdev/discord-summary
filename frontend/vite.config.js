import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 500
  },
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.SUMMARY_BACKEND_URL || "http://127.0.0.1:8790"
    }
  }
});
