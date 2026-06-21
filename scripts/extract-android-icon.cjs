#!/usr/bin/env node
/**
 * 从已构建的 Android release APK 提取最高分辨率的 launcher icon,
 * 写到 public/amiga-icon.png 作为聊天助手的头像。
 *
 * 为什么不直接用 src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png?
 *   - 那是 Tauri CLI 生成的占位小图(3186 字节,绿色方块 + 白 I),
 *     不是 Android 桌面上看到的实际图标。
 *   - Tauri 在 Android 构建时从其他源(本项目是 brand SVG)生成最终图标,
 *     打包进 APK 的 res/as.png(432x432)、res/o-.png(192x192)等。
 *   - 用户在 Android 桌面看到的就是这个 brand icon,聊天头像必须和它一致。
 *
 * 用法:
 *   1. 跑 build-android.bat 构建出 app-universal-release.apk
 *   2. node scripts/extract-android-icon.cjs
 *
 * 输出: public/amiga-icon.png(被 git 跟踪,作为 <img src> 资源)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const APK = path.join(
  PROJECT_ROOT,
  "src-tauri",
  "gen",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "universal",
  "release",
  "app-universal-release.apk"
);
const OUT = path.join(PROJECT_ROOT, "public", "amiga-icon.png");
const AAPT = path.join(
  process.env.LOCALAPPDATA || "",
  "Android",
  "Sdk",
  "build-tools",
  "36.1.0",
  "aapt.exe"
);

if (!fs.existsSync(APK)) {
  console.error("APK not found:", APK);
  console.error("先跑 build-android.bat 构建 release APK");
  process.exit(1);
}

if (!fs.existsSync(AAPT)) {
  console.error("aapt not found:", AAPT);
  process.exit(1);
}

const tmp = path.join(PROJECT_ROOT, "TempIcon");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
const zipPath = path.join(tmp, "app.zip");
fs.copyFileSync(APK, zipPath);
execSync(`tar -xf "${zipPath}" -C "${tmp}"`, { stdio: "inherit" });
fs.unlinkSync(zipPath);

const resDir = path.join(tmp, "res");
const pngs = fs
  .readdirSync(resDir)
  .filter((f) => f.endsWith(".png"))
  .map((f) => ({
    name: f,
    path: path.join(resDir, f),
    size: fs.statSync(path.join(resDir, f)).size,
  }));

if (pngs.length === 0) {
  console.error("No PNGs found in APK res/");
  process.exit(1);
}

const largest = pngs.sort((a, b) => b.size - a.size)[0];
console.log(
  `从 APK 提取最大 PNG: ${largest.name} (${largest.size} bytes) -> ${path.relative(
    PROJECT_ROOT,
    OUT
  )}`
);

fs.copyFileSync(largest.path, OUT);
fs.rmSync(tmp, { recursive: true, force: true });

console.log("Done.");
