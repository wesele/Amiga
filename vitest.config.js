import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // "threads" is ~40% faster than the default "forks" here and avoids the
    // intermittent "Timeout waiting for worker to respond" bootstrap failures
    // that made `npm test` exit 0 while a file never ran.
    pool: "threads",
    environment: "happy-dom",
    include: [
      "src/**/*.{test,spec}.{js,ts}",
      "scripts/**/*.{test,spec}.{js,ts}",
    ],
    globals: true,
    setupFiles: [],
  },
});
