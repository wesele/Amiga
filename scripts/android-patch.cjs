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
//   - The same applies to AndroidManifest.xml: the generated copy is
//     overwritten on every `tauri android init`, so we keep a tracked
//     *fragment* and merge it in here. The fragment adds a <queries>
//     block so tauri-plugin-shell's Intent.ACTION_VIEW for http(s)
//     URLs can see the system browser on Android 11+ (API 30) — see
//     the comment in src-tauri/android/app/src/main/AndroidManifest.xml
//     for the full context.
//
// Usage:
//   node scripts/android-patch.cjs           # copy (no overwrite unless --force)
//   node scripts/android-patch.cjs --force   # overwrite even if newer
//
// Exit code 0 on success, non-zero on error.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_JAVA = path.join(ROOT, "src-tauri", "android", "app", "src", "main", "java");
const DST_JAVA = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "java");
const SRC_MANIFEST = path.join(ROOT, "src-tauri", "android", "app", "src", "main", "AndroidManifest.xml");
const DST_MANIFEST = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "AndroidManifest.xml");

// Markers wrapping the merged fragment inside the generated manifest.
// The string content is what scripts/__tests__/android-patch.spec.js
// asserts on, so don't change it without updating the tests.
const PATCH_BEGIN = "<!-- AMIGA-PATCH-BEGIN: amiga-manifest-fragment -->";
const PATCH_END = "<!-- AMIGA-PATCH-END: amiga-manifest-fragment -->";

const FORCE = process.argv.includes("--force");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the inner XML of the root <manifest> element from a manifest
 * fragment string. Returns the body **with its original indentation
 * preserved** (only the surrounding <manifest>...</manifest> tags are
 * stripped), or null when the root element is missing.
 *
 * Keeping the original indent matters because [mergeManifest] uses
 * [dedent] to normalize the body before re-indenting it to match the
 * 4-space convention of Tauri's generated manifest. Trimming the body
 * here would destroy the leading-whitespace signal that dedent needs.
 *
 * Exported so the vitest spec can pin the behavior.
 */
function extractFragmentBody(fragment) {
  const m = fragment.match(/<manifest\b[^>]*>([\s\S]*?)<\/manifest>/);
  return m ? m[1] : null;
}

/**
 * Remove the common leading whitespace from every non-blank line of
 * `text`, so a fragment written with arbitrary indentation comes out
 * flush-left relative to the caller's chosen indent.
 */
function dedent(text) {
  const lines = text.split("\n");
  let common = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^[ \t]*/);
    const lead = m ? m[0] : "";
    if (common === null) {
      common = lead;
      continue;
    }
    // Trim `common` to the shared prefix with `lead`.
    let i = 0;
    while (i < common.length && i < lead.length && common[i] === lead[i]) i++;
    common = common.slice(0, i);
    if (!common) break;
  }
  if (!common) return text;
  return lines
    .map((l) => (l.startsWith(common) ? l.slice(common.length) : l))
    .join("\n");
}

/**
 * Strip leading and trailing *blank* lines from `text` (a multi-line
 * string) but preserve internal whitespace, so a body like
 * "\n   <x/>\n" becomes "<x/>". Used to keep the merged block visually
 * tight against its marker comments.
 */
function trimBlankLines(text) {
  return text.replace(/^(?:\s*\n)+|(?:\n\s*)+$/g, "");
}

/**
 * Merge `fragmentBody` (a chunk of XML that should sit at the top level
 * of the <manifest> element) into `generated`, an existing
 * AndroidManifest.xml string. Idempotent: any prior patch block from a
 * previous run is removed first, so calling this multiple times yields
 * the same result.
 *
 * Returns the new manifest string, or `generated` unchanged if the
 * fragment is already merged in.
 */
function mergeManifest(generated, fragmentBody) {
  if (!fragmentBody) return generated;
  // The fragment may have any leading indentation in its source form
  // (the file is written for humans, not for direct injection). Strip
  // the common leading whitespace first, then re-indent every line to
  // match the 4-space convention used by Tauri's generated manifest
  // for top-level <manifest> children. trimBlankLines drops the
  // surrounding newlines the regex match leaves behind, so the block
  // sits flush against its marker comments.
  const normalized = trimBlankLines(dedent(fragmentBody));
  if (!normalized) return generated;
  const block = `${PATCH_BEGIN}\n${normalized}\n${PATCH_END}`;
  // Idempotency: drop any previous block, including the trailing newline
  // we insert after the end marker, so re-runs don't accumulate.
  const re = new RegExp(
    `${escapeRegExp(PATCH_BEGIN)}[\\s\\S]*?${escapeRegExp(PATCH_END)}\\n?`,
    "g",
  );
  const stripped = generated.replace(re, "");
  const closingTag = "</manifest>";
  const idx = stripped.lastIndexOf(closingTag);
  if (idx === -1) {
    throw new Error("generated manifest has no </manifest> closing tag");
  }
  // Insert the block at the start of the line that holds </manifest>,
  // so the closing tag stays on its own line. Top-level <manifest>
  // children in the generated file use 4-space indent, so the block
  // lines are indented the same way.
  const lineStart = stripped.lastIndexOf("\n", idx - 1) + 1;
  const upToLineStart = stripped.slice(0, lineStart);
  const blockIndented = block.split("\n").map((l) => "    " + l).join("\n");
  const next = upToLineStart + blockIndented + "\n" + stripped.slice(idx);
  return next === generated ? generated : next;
}

module.exports = {
  PATCH_BEGIN,
  PATCH_END,
  extractFragmentBody,
  mergeManifest,
  dedent,
  trimBlankLines,
};

// ===== CLI entry =====

if (require.main === module) {
  if (!fs.existsSync(SRC_JAVA)) {
    console.error(`[android-patch] Java source not found: ${SRC_JAVA}`);
    console.error("[android-patch] Nothing to patch. (Did you forget to add the custom Kotlin files?)");
    process.exit(1);
  }

  if (!fs.existsSync(DST_JAVA)) {
    console.error(`[android-patch] Java destination not found: ${DST_JAVA}`);
    console.error("[android-patch] Run `npm run tauri android init` first to generate the Android project, then re-run this script.");
    process.exit(1);
  }

  let copied = 0;
  let skipped = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.join(dir, entry.name);
      const relPath = path.relative(SRC_JAVA, srcPath);
      const dstPath = path.join(DST_JAVA, relPath);
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

  walk(SRC_JAVA);

  // AndroidManifest.xml: merge the tracked fragment (if any) into the
  // generated manifest.
  let manifestPatched = false;
  if (fs.existsSync(SRC_MANIFEST)) {
    if (!fs.existsSync(DST_MANIFEST)) {
      console.error(`[android-patch] Manifest fragment found but generated manifest missing: ${DST_MANIFEST}`);
      console.error("[android-patch] Run `npm run tauri android init` first to generate the Android project, then re-run this script.");
      process.exit(1);
    }
    const fragment = fs.readFileSync(SRC_MANIFEST, "utf8");
    const fragmentBody = extractFragmentBody(fragment);
    if (fragmentBody === null) {
      console.error(`[android-patch] Fragment at ${SRC_MANIFEST} is missing a <manifest> root element`);
      process.exit(1);
    }
    const gen = fs.readFileSync(DST_MANIFEST, "utf8");
    const next = mergeManifest(gen, fragmentBody);
    if (next !== gen) {
      fs.writeFileSync(DST_MANIFEST, next);
      manifestPatched = true;
    }
  }

  console.log(
    `[android-patch] done. copied=${copied} skipped=${skipped} force=${FORCE} manifestPatched=${manifestPatched}`,
  );
}
