import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 1420;
const DIST_DIR = process.env.DIST_DIR || join(__dirname, "dist");

const LLM_PROVIDERS = {
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

const NEWS_FEEDS = {
  "/news/rtve/rss.xml": "https://www.rtve.es/rss/tag_noticias.xml",
  "/news/elmundo/rss.xml": "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml",
  "/news/abc/rss.xml": "https://www.abc.es/rss/2.xml",
  "/news/npr/rss.xml": "https://feeds.npr.org/1001/rss.xml",
  "/news/nyt/rss.xml": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "/news/chinadaily/rss.xml": "https://www.chinadaily.com.cn/rss/world_rss.xml",
  "/news/cgtn/rss.xml": "https://www.cgtn.com/subscribe.rss",
};

const app = express();

for (const [alias, target] of Object.entries(LLM_PROVIDERS)) {
  app.use(`/llm/${alias}`, createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 300000,
    timeout: 300000,
    on: { proxyReq: (proxyReq) => proxyReq.setHeader("connection", "keep-alive") },
  }));
}

for (const [path, targetUrl] of Object.entries(NEWS_FEEDS)) {
  const upstream = new URL(targetUrl);
  app.use(path, createProxyMiddleware({
    target: upstream.origin,
    changeOrigin: true,
    pathRewrite: () => `${upstream.pathname}${upstream.search}`,
    proxyTimeout: 20000,
    timeout: 20000,
  }));
}

app.use(express.static(DIST_DIR));

app.use((req, res) => {
  res.sendFile(join(DIST_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Amiga Web server running on http://0.0.0.0:${PORT}`);
});
