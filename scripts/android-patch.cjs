// scripts/android-patch.cjs
//
// Copies the project's custom Android source (tracked in git at
// src-tauri/android/...) into the Tauri-generated
// src-tauri/gen/android/... tree so it actually gets compiled into the APK.
//
// Why we need this:
//   - `tauri android build` generates the Android project under
//     `src-tauri/gen/android/`. By default that tree is the entire source
//     of truth for the Kotlin side.
//   - The tree is gitignored; the project's customisations (insets bridge
//     + selection translate callback) live under `src-tauri/android/...` so
//     they can be tracked and reviewed.
//   - Without this script, `tauri android init` would overwrite our
//     custom MainActivity.kt with the stock stub, breaking Android
//     behavior.
//
// Usage:
//   node scripts/android-patch.cjs           # copy (no overwrite unless --force)
//   node scripts/android-patch.cjs --force   # overwrite even if newer
//
// Exit code 0 on success, non-zero on error.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src-tauri", "android", "app", "src", "main", "java");
const DST = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "java");

const FORCE = process.argv.includes("--force");

if (!fs.existsSync(SRC)) {
  console.error(`[android-patch] Source not found: ${SRC}`);
  console.error("[android-patch] Nothing to patch. (Did you forget to add the custom Kotlin files?)");
  process.exit(1);
}

if (!fs.existsSync(DST)) {
  console.error(`[android-patch] Destination not found: ${DST}`);
  console.error("[android-patch] Run `npm run tauri android init` first to generate the Android project, then re-run this script.");
  process.exit(1);
}

let copied = 0;
let skipped = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name);
    const relPath = path.relative(SRC, srcPath);
    const dstPath = path.join(DST, relPath);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      walk(srcPath);
    } else if (entry.isFile()) {
      const exists = fs.existsSync(dstPath);
      if (exists && !FORCE) {
        const srcStat = fs.statSync(srcPath);
        const dstStat = fs.statSync(dstPath);
        if (dstStat.mtimeMs >= srcStat.mtimeMs) {
          skipped++;
          continue;
        }
      }
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
      // Touch dst to be newer than src so subsequent runs of this script
      // don't re-copy unless the source actually changes.
      const now = new Date();
      fs.utimesSync(dstPath, now, now);
      console.log(`[android-patch] ${exists ? "updated" : "added"}   ${relPath}`);
      copied++;
    }
  }
}

walk(SRC);

console.log(`[android-patch] done. copied=${copied} skipped=${skipped} force=${FORCE}`);
