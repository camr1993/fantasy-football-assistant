import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env": "{}",
    process: "{}",
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/content/content.tsx"),
      name: "ContentScript",
      fileName: () => "content.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        format: "iife",
        name: "ContentScript",
      },
    },
    outDir: "dist",
    emptyOutDir: false,
  },
  publicDir: false,
});
