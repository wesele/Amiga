// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import providers from "../llmProviders.json";
import { createWebDevProxy } from "../../../../vite.config.js";

const SOURCE_OF_TRUTH = "src/shared/web/llmProviders.json";
const expected = new Map(Object.entries(providers));

function repoFile(relativePath) {
  return readFileSync(new URL(`../../../../${relativePath}`, import.meta.url), "utf8");
}

function assertSameProviders(file, actual) {
  const problems = [];
  const missing = [...expected.keys()].filter((alias) => !actual.has(alias));
  const extra = [...actual.keys()].filter((alias) => !expected.has(alias));
  const wrong = [...expected.entries()].filter(
    ([alias, origin]) => actual.has(alias) && actual.get(alias) !== origin,
  ).map(([alias, origin]) => `${alias} (expected ${origin}, found ${actual.get(alias)})`);

  if (missing.length) problems.push(`missing alias: ${missing.join(", ")}`);
  if (extra.length) problems.push(`unknown alias: ${extra.join(", ")}`);
  if (wrong.length) problems.push(`wrong origin: ${wrong.join(", ")}`);
  if (problems.length) {
    throw new Error(`${file} does not match ${SOURCE_OF_TRUTH} — ${problems.join("; ")}`);
  }
}

function parseServerProviders() {
  const text = repoFile("deploy/web/server.js");
  const block = text.match(/const LLM_PROVIDERS = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("deploy/web/server.js: LLM_PROVIDERS block not found");
  return new Map([...block[1].matchAll(/([A-Za-z0-9_-]+):\s*"(https:\/\/[^"]+)"/g)]
    .map((match) => [match[1], match[2]]));
}

function parseNginxProviders() {
  const text = repoFile("deploy/web/nginx.conf.example");
  const blocks = [...text.matchAll(/location \/llm\/([A-Za-z0-9_-]+)\/ \{([\s\S]*?)\n {4}\}/g)];
  if (!blocks.length) throw new Error("deploy/web/nginx.conf.example: no /llm/<alias>/ blocks found");
  return new Map(blocks.map(([, alias, body]) => {
    const pass = body.match(/proxy_pass\s+(https:\/\/[^/\s]+)\//);
    return [alias, pass ? pass[1] : "(no proxy_pass)"];
  }));
}

describe("LLM provider registry", () => {
  it("lists 13 unique providers with valid HTTPS origins", () => {
    expect(expected.size).toBe(13);
    for (const [alias, origin] of expected) {
      expect(alias).toMatch(/^[a-z0-9]+$/);
      const url = new URL(origin);
      expect(url.protocol).toBe("https:");
      expect(url.origin).toBe(origin);
      expect(url.pathname).toBe("/");
    }
    const hostnames = [...expected.values()].map((origin) => new URL(origin).hostname);
    expect(new Set(hostnames).size).toBe(hostnames.length);
  });

  it("matches the Vite dev proxy targets", () => {
    const proxy = createWebDevProxy();
    const actual = new Map(Object.entries(proxy).map(([prefix, options]) => [
      prefix.replace(/^\/llm\//, ""),
      options.target,
    ]));
    expect(Object.keys(proxy).length).toBe(expected.size);
    assertSameProviders("vite.config.js (createWebDevProxy)", actual);
  });

  it("matches LLM_PROVIDERS in deploy/web/server.js", () => {
    assertSameProviders("deploy/web/server.js", parseServerProviders());
  });

  it("matches the /llm/<alias>/ blocks in deploy/web/nginx.conf.example", () => {
    assertSameProviders("deploy/web/nginx.conf.example", parseNginxProviders());
  });
});
