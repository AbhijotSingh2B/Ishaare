import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // Enable HTTPS so iOS Safari allows camera access (mediaDevices is undefined on plain HTTP)
  plugins: [basicSsl()],

  optimizeDeps: {
    // @mediapipe/tasks-vision ships its own ESM bundle + WASM loader.
    // Vite must NOT pre-bundle it or the WASM paths break.
    exclude: ["@mediapipe/tasks-vision"],
    // fingerpose is CJS-only — Vite MUST pre-bundle it to convert to ESM.
    include: ["fingerpose"],
  },
  server: {
    host: true,
    https: true,
  },
  build: {
    sourcemap: false,
  },
});

