// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { NATIVE_ONLY_COMMANDS } from "../nativeOnlyCommands.js";

function readProjectFile(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  // 转成路径字符串再读，避免 fs 对 URL 对象的跨 realm 处理差异。
  return readFileSync(fileURLToPath(url.href), "utf8");
}

function readProjectDir(relativePath) {
  const dir = fileURLToPath(new URL(relativePath, import.meta.url).href);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

const libRsSource = readProjectFile("../../../../src-tauri/src/lib.rs");
// 命令实现分布在入口文件和 backend/ 下的各命令模块里，需要合并扫描。
const webBackendSource = [
  readProjectFile("../webBackend.js"),
  ...readProjectDir("../backend/"),
].join("\n");

function parseRegisteredCommands(source) {
  const marker = "generate_handler![";
  const start = source.indexOf(marker);
  if (start === -1) return [];
  const end = source.indexOf("]", start + marker.length);
  if (end === -1) return [];
  const block = source.slice(start + marker.length, end);

  const commands = new Set();
  for (const match of block.matchAll(/commands::([A-Za-z0-9_:]+)/g)) {
    const segments = match[1].split("::").filter(Boolean);
    if (segments.length > 0) commands.add(segments[segments.length - 1]);
  }
  return [...commands];
}

const registeredCommands = parseRegisteredCommands(libRsSource);

function hasWebImplementation(name) {
  return webBackendSource.includes(`case "${name}":`);
}

describe("command contract parity", () => {
  it("parses the command registry from lib.rs", () => {
    // 解析逻辑一旦失效（例如 lib.rs 换了写法），这条会先炸，避免下面几条永远绿。
    expect(registeredCommands.length).toBeGreaterThan(100);
  });

  it("registers every Tauri command in webBackend or nativeOnlyCommands", () => {
    const missing = registeredCommands.filter(
      (name) => !hasWebImplementation(name) && !NATIVE_ONLY_COMMANDS.has(name),
    );

    expect(
      missing,
      missing.length > 0
        ? `命令 ${missing.join(", ")} 既没有 webBackend 实现，也没有登记到 nativeOnlyCommands.js`
        : "",
    ).toEqual([]);
  });

  it("keeps every native-only entry in sync with lib.rs", () => {
    const stale = [...NATIVE_ONLY_COMMANDS.keys()].filter(
      (name) => !registeredCommands.includes(name),
    );

    expect(
      stale,
      stale.length > 0
        ? `nativeOnlyCommands.js 里的 ${stale.join(", ")} 已不在 lib.rs 注册，请删除死条目`
        : "",
    ).toEqual([]);
  });

  it("does not whitelist commands that webBackend already implements", () => {
    const redundant = [...NATIVE_ONLY_COMMANDS.keys()].filter(hasWebImplementation);

    expect(
      redundant,
      redundant.length > 0
        ? `命令 ${redundant.join(", ")} 已在 webBackend 实现，不应出现在 nativeOnlyCommands.js`
        : "",
    ).toEqual([]);
  });
});
