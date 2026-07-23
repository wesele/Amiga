import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const port = parseInt(process.env.VITE_PORT || "1420", 10);
const hmrPort = parseInt(process.env.VITE_HMR_PORT || "1421", 10);

const webProxyTargets = {
  openai: "https://api.openai.com",
  nvidia: "https://integrate.api.nvidia.com",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com",
  openrouter: "https://openrouter.ai",
  mistral: "https://api.mistral.ai",
  xai: "https://api.x.ai",
  together: "https://api.together.xyz",
  fireworks: "https://api.fireworks.ai",
  perplexity: "https://api.perplexity.ai",
  siliconflow: "https://api.siliconflow.cn",
  dashscope: "https://dashscope.aliyuncs.com",
  gemini: "https://generativelanguage.googleapis.com",
};

function createWebDevProxy() {
  return Object.fromEntries(Object.entries(webProxyTargets).map(([alias, target]) => {
    const prefix = `/llm/${alias}`;
    return [prefix, {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.slice(prefix.length) || "/",
    }];
  }));
}

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
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
    proxy: mode === "web" ? createWebDevProxy() : undefined,
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
