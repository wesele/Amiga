import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const port = parseInt(process.env.VITE_PORT || "1420", 10);
const hmrPort = parseInt(process.env.VITE_HMR_PORT || "1421", 10);

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  cacheDir: "./node_modules/.vite-cache",
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: hmrPort,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["vue", "pinia", "vue-router", "marked"],
          tauri: ["@tauri-apps/api", "@tauri-apps/plugin-shell"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["vue", "pinia", "vue-router", "marked", "@tauri-apps/api"],
  },
});
