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
//   - The same idempotent-marker trick is applied to build.gradle.kts to
//     sign the **debug** buildType with the project's release keystore.
//     Without this, every `tauri android dev` produces a debug-keystore
//     APK, while `build-android.bat` produces a release-keystore APK —
//     the two have different signing certs, so `adb install -r` fails
//     with INSTALL_FAILED_UPDATE_INCOMPATIBLE when developers switch
//     between dev and release builds on the same device/emulator.
//     Signing both with the same keystore removes that class of failures.
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
const SRC_RES = path.join(ROOT, "src-tauri", "android", "app", "src", "main", "res");
const DST_RES = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "res");
const SRC_MANIFEST = path.join(ROOT, "src-tauri", "android", "app", "src", "main", "AndroidManifest.xml");
const DST_MANIFEST = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "AndroidManifest.xml");
const DST_GRADLE = path.join(ROOT, "src-tauri", "gen", "android", "app", "build.gradle.kts");

// Markers wrapping the merged fragment inside the generated manifest.
// The string content is what scripts/__tests__/android-patch.spec.js
// asserts on, so don't change it without updating the tests.
const PATCH_BEGIN = "<!-- AMIGA-PATCH-BEGIN: amiga-manifest-fragment -->";
const PATCH_END = "<!-- AMIGA-PATCH-END: amiga-manifest-fragment -->";

// Markers wrapping the debug-signingConfig snippet we inject into the
// generated app/build.gradle.kts. Idempotent against re-runs just like
// the manifest fragment. See [mergeGradleDebugSigning] below.
const PATCH_GRADLE_BEGIN = "// AMIGA-PATCH-BEGIN: debug-signing";
const PATCH_GRADLE_END = "// AMIGA-PATCH-END: debug-signing";

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
 * Patch the <application> tag in the generated AndroidManifest to add
 * Android Auto Backup attributes.
 *
 * Adds:
 *   android:allowBackup="true"
 *   android:fullBackupContent="@xml/backup_rules"
 *   android:dataExtractionRules="@xml/data_extraction_rules"
 *
 * Idempotent: skips if android:allowBackup is already present.
 *
 * Returns the patched manifest string, or the input unchanged if already
 * patched.
 */
function mergeBackupAttributes(manifest) {
  if (manifest.includes('android:allowBackup="true"')) return manifest;

  const anchor = 'android:usesCleartextTraffic=';
  if (!manifest.includes(anchor)) {
    // Tauri template changed shape — fall back to injecting after the
    // last attribute before the closing > of <application.
    const appTagRe = /(<application\b[\s\S]*?)(\s*>)/;
    const m = manifest.match(appTagRe);
    if (!m) return manifest;
    const attrs =
      '\n        android:allowBackup="true"' +
      '\n        android:fullBackupContent="@xml/backup_rules"' +
      '\n        android:dataExtractionRules="@xml/data_extraction_rules"';
    return manifest.replace(appTagRe, '$1' + attrs + '$2');
  }

  const attrs =
    '\n        android:allowBackup="true"' +
    '\n        android:fullBackupContent="@xml/backup_rules"' +
    '\n        android:dataExtractionRules="@xml/data_extraction_rules">';

  return manifest.replace(
    /(android:usesCleartextTraffic="[^"]*")\s*>/,
    '$1' + attrs,
  );
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

/**
 * Ensure the generated `app/build.gradle.kts` has the keystore
 * infrastructure that `mergeGradleDebugSigning` depends on:
 * `import java.io.FileInputStream`, the `keystoreProperties` variable,
 * a `signingConfigs` block, and a `signingConfig` assignment in the
 * release buildType.
 *
 * Tauri 2.11.2+ generates a simplified build.gradle.kts without these
 * blocks (signing is handled externally by the CLI). This function
 * injects them when missing so the debug-signing patch can reference
 * `keystoreProperties` and `signingConfigs`.
 *
 * Idempotent: does nothing if the infrastructure already exists.
 * Returns the (possibly modified) gradle file content.
 */
function ensureGradleKeystore(generated) {
  let result = generated;

  // 1. Ensure `import java.io.FileInputStream`
  if (!result.includes("import java.io.FileInputStream")) {
    result = result.replace(
      "import java.util.Properties",
      "import java.util.Properties\nimport java.io.FileInputStream",
    );
  }

  // 2. Ensure keystoreProperties block after tauriProperties
  if (!result.includes("val keystoreProperties")) {
    // Match the entire tauriProperties block — from `val tauriProperties`
    // through its closing top-level `}`, so we insert after it.
    const re = /val tauriProperties\b[\s\S]*?\n\}(?=\r?\n(?:$|\r?\n))/;
    const m = result.match(re);
    if (m) {
      const insertAt = m.index + m[0].length;
      result =
        result.slice(0, insertAt) +
        "\n\n" +
        "val keystoreProperties = Properties()\n" +
        "val keystorePropertiesFile = file(\"keystore.properties\")\n" +
        "if (keystorePropertiesFile.exists()) {\n" +
        "    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }\n" +
        "}\n" +
        result.slice(insertAt);
    }
  }

  // 3. Ensure signingConfigs inside android { ... } before buildTypes
  if (!result.includes("signingConfigs")) {
    result = result.replace(
      /(\n\s{4}buildTypes\s*\{)/,
      "\n    signingConfigs {\n" +
      '        create("release") {\n' +
      '            storeFile = keystoreProperties["storeFile"]?.toString()?.let { file(it) }\n' +
      '            storePassword = keystoreProperties["storePassword"]?.toString() ?: ""\n' +
      '            keyAlias = keystoreProperties["keyAlias"]?.toString() ?: ""\n' +
      '            keyPassword = keystoreProperties["keyPassword"]?.toString() ?: ""\n' +
      "        }\n" +
      "    }\n$1",
    );
  }

  // 4. Ensure signingConfig assignment inside the release buildType
  if (!result.includes("signingConfig = signingConfigs")) {
    result = result.replace(
      /(getByName\("release"\)\s*\{)(\r?\n)/,
      "$1$2            signingConfig = signingConfigs.findByName(\"release\") ?: signingConfigs.getByName(\"debug\")$2",
    );
  }

  return result;
}

/**
 * Inject a `signingConfig = signingConfigs.getByName("release")` assignment
 * guarded by a keystore-properties check into the `debug` buildType block
 * of a Tauri-generated `app/build.gradle.kts`.
 *
 * Why: by default Tauri's generated build.gradle.kts only signs the
 * `release` buildType with the project's release keystore; `debug`
 * signs with `~/.android/debug.keystore`. Switching between
 * `tauri android dev` (debug-keystore) and `build-android.bat`
 * (release-keystore) on the same device triggers
 * `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the two certs differ.
 * Forcing the debug buildType to reuse the release keystore (when one
 * is configured via keystore.properties) makes the two signatures
 * identical so `adb install -r` works in both directions.
 *
 * The injection happens directly after the `getByName("debug") {` line
 * so the assignment is the first statement in the block and isn't
 * reordered relative to other assignments (Kotlin allows free ordering
 * inside a block).
 *
 * Idempotent: a prior patch block (between PATCH_GRADLE_BEGIN and
 * PATCH_GRADLE_END) is stripped first.
 *
 * Before patching, [ensureGradleKeystore] is called to guarantee that
 * the keystore infrastructure (`keystoreProperties`, `signingConfigs`)
 * exists in the file — Tauri 2.11.2+ omits these from its template.
 *
 * Returns the patched file content, or the input unchanged if already
 * patched (i.e. the strip left the file identical and no insertion was
 * needed).
 *
 * Throws if the generated gradle file has no `getByName("debug") {`
 * block — that would mean Tauri's template changed shape and this
 * patch's anchor must be updated.
 */
function mergeGradleDebugSigning(generated) {
  // Ensure the generated gradle has the keystore plumbing that the
  // debug-signing patch depends on (Tauri 2.11.2+ drops it from the
  // default template).
  generated = ensureGradleKeystore(generated);
  // Detect the file's line ending so the inserted block matches the
  // surrounding style (no mixed CR/LF when re-running on Windows
  // machines where `tauri android init` writes CRLF).
  const eol = generated.includes("\r\n") ? "\r\n" : "\n";
  // The patch body lives at 12 spaces of indent (matches
  // `getByName("debug") {` body level in Tauri's generated gradle:
  // 4 spaces for the surrounding `buildTypes {`, 4 more for the
  // buildType block, 4 more for statements inside it).
  const bodyLines = [
    'if (keystoreProperties.getProperty("storeFile") != null) {',
    "    signingConfig = signingConfigs.getByName(\"release\")",
    "}",
  ];
  const indentedBody = bodyLines.map((l) => "            " + l).join(eol);
  const block = `            ${PATCH_GRADLE_BEGIN}${eol}${indentedBody}${eol}            ${PATCH_GRADLE_END}${eol}`;

  // Strip any previous patch block first (idempotency). Leading
  // whitespace before the BEGIN marker (the 12-space indent we add when
  // inserting) is included in the strip range so re-runs don't leave
  // the orphan indent behind on the next line; the optional trailing
  // newline-ish sequence swallows the line break we appended after the
  // END marker so no blank line accumulates either.
  const re = new RegExp(
    `[ ]*${escapeRegExp(PATCH_GRADLE_BEGIN)}[\\s\\S]*?${escapeRegExp(PATCH_GRADLE_END)}\\r?\\n?`,
    "g",
  );
  const stripped = generated.replace(re, "");

  // Anchor: insert immediately after the opening brace of the debug
  // buildType block. Using a RegExp with the brace (not just a
  // substring search) avoids accidentally matching the same identifier
  // inside comments. The optional `\r` lets the patch work on both
  // CRLF (Windows, default for tauri android init) and LF line endings.
  const anchorRe = /(\bgetByName\("debug"\)\s*\{\r?\n)/;
  const m = stripped.match(anchorRe);
  if (!m) {
    throw new Error(
      "generated build.gradle.kts has no `getByName(\"debug\") {` block — " +
        "Tauri template likely changed; update mergeGradleDebugSigning",
    );
  }
  const insertAt = m.index + m[1].length;
  const next = stripped.slice(0, insertAt) + block + stripped.slice(insertAt);
  return next === generated ? generated : next;
}

module.exports = {
  PATCH_BEGIN,
  PATCH_END,
  PATCH_GRADLE_BEGIN,
  PATCH_GRADLE_END,
  extractFragmentBody,
  mergeManifest,
  mergeBackupAttributes,
  mergeGradleDebugSigning,
  ensureGradleKeystore,
  dedent,
  trimBlankLines,
};

// ===== CLI entry =====

// Tracked resource files to copy (relative to SRC_RES). The build system
// uses the gen/ tree as the actual compilation source, so our custom res/
// files must land there.
const KNOWN_RES = ["xml/backup_rules.xml", "xml/data_extraction_rules.xml"];

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

  if (!fs.existsSync(DST_RES)) {
    console.error(`[android-patch] Resource destination not found: ${DST_RES}`);
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

  // Copy custom resource files (backup_rules.xml etc.) from tracked res/
  // to generated res/, so Android's build system picks them up when
  // compiling the APK.
  let resCopied = 0;
  let resSkipped = 0;
  for (const rel of KNOWN_RES) {
    const srcPath = path.join(SRC_RES, rel);
    const dstPath = path.join(DST_RES, rel);
    if (!fs.existsSync(srcPath)) {
      // The file may not exist yet if the tracked res/ hasn't been
      // created cleanly on a fresh checkout; skip silently.
      continue;
    }
    const exists = fs.existsSync(dstPath);
    if (exists && !FORCE) {
      const srcStat = fs.statSync(srcPath);
      const dstStat = fs.statSync(dstPath);
      if (dstStat.mtimeMs >= srcStat.mtimeMs) {
        resSkipped++;
        continue;
      }
    }
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    const now = new Date();
    fs.utimesSync(dstPath, now, now);
    console.log(`[android-patch] ${exists ? "updated" : "added"}   res/${rel}`);
    resCopied++;
  }

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
    // Apply backup attributes on the (possibly merged) manifest.
    const afterFrag = manifestPatched ? fs.readFileSync(DST_MANIFEST, "utf8") : next;
    const withBackup = mergeBackupAttributes(afterFrag);
    if (withBackup !== afterFrag) {
      fs.writeFileSync(DST_MANIFEST, withBackup);
      if (!manifestPatched) {
        manifestPatched = true;
        console.log("[android-patch] backup attributes patched");
      }
    }
  }

  // build.gradle.kts: inject the debug-signingConfig snippet so dev
  // APKs reuse the release keystore (avoids signature mismatches when
  // switching between dev and release builds on the same device).
  let gradlePatched = false;
  if (fs.existsSync(DST_GRADLE)) {
    const genGradle = fs.readFileSync(DST_GRADLE, "utf8");
    const nextGradle = mergeGradleDebugSigning(genGradle);
    if (nextGradle !== genGradle) {
      fs.writeFileSync(DST_GRADLE, nextGradle);
      gradlePatched = true;
    }
  } else {
    console.error(`[android-patch] Generated gradle file not found: ${DST_GRADLE}`);
    console.error("[android-patch] Run `npm run tauri android init` first to generate the Android project, then re-run this script.");
    process.exit(1);
  }

  console.log(
    `[android-patch] done. copied=${copied} skipped=${skipped} resCopied=${resCopied} resSkipped=${resSkipped} force=${FORCE} manifestPatched=${manifestPatched} gradlePatched=${gradlePatched}`,
  );
}
