import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import providers from "./src/shared/web/llmProviders.json";
import { mintClassroomToken, classroomTokenAllowed } from "./deploy/web/classroom-token.js";

const host = process.env.TAURI_DEV_HOST;
const port = parseInt(process.env.VITE_PORT || "1420", 10);
const hmrPort = parseInt(process.env.VITE_HMR_PORT || "1421", 10);

// Exported so llmProviders.spec.js can verify the dev proxy against the JSON.
export function createWebDevProxy() {
  return Object.fromEntries(Object.entries(providers).map(([alias, target]) => {
    const prefix = `/llm/${alias}`;
    return [prefix, {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.slice(prefix.length) || "/",
    }];
  }));
}

// Fixed news search alias for local `dev:web` (mirrors deploy/web/server.js).
// Only the Google News search path is proxied; the query passes through to
// the fixed HTTPS host, never to a browser-supplied upstream.
function createWebNewsDevProxy() {
  const prefix = "/news/google-search";
  return {
    [prefix]: {
      target: "https://news.google.com",
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.slice(prefix.length) || "/",
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === "web" ? [{ name: "amiga-classroom-token", configureServer(server) {
    server.middlewares.use("/api/classroom-token", async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      if (!classroomTokenAllowed(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: "Forbidden" })); return; }
      try { res.end(JSON.stringify(await mintClassroomToken())); }
      catch (error) { res.statusCode = 503; res.end(JSON.stringify({ error: error.message })); }
    });
  } }] : [])],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  cacheDir: process.env.VITE_CACHE_DIR || "./node_modules/.vite-cache",
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
    proxy: mode === "web" ? { ...createWebDevProxy(), ...createWebNewsDevProxy() } : undefined,
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
}));
