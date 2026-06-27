const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const setMode = args[0] === "--set-version";
const versionArgIndex = setMode ? 1 : 0;
const oldVer = setMode ? null : args[0];
const newVer = args[versionArgIndex];
const files = args.slice(versionArgIndex + 1);

if (!newVer || !isSemver(newVer)) {
  printUsageAndExit();
}

const targetFiles = files.length > 0 ? files : getDefaultFiles();
if (targetFiles.length === 0) {
  printUsageAndExit();
}

for (const f of targetFiles) {
  try {
    const c = fs.readFileSync(f, "utf8");
    const updated = updateFile(f, c, oldVer, newVer, setMode);
    if (updated !== c) {
      fs.writeFileSync(f, updated, "utf8");
      console.log("  Updated: " + f);
    } else {
      console.log("  No change: " + f);
    }
  } catch (e) {
    console.log("  Skipped: " + f + " (" + e.message + ")");
  }
}

function updateFile(filePath, content, oldVersion, newVersion, directSet) {
  const base = path.basename(filePath);

  if (base === "package.json" || base === "tauri.conf.json" || base === "tauri.android.conf.json") {
    return updateJsonVersion(content, newVersion);
  }

  if (base === "Cargo.toml") {
    return content.replace(
      /(\[package\][\s\S]*?^version = ")([^"]+)(")/m,
      "$1" + newVersion + "$3",
    );
  }

  if (base === "Cargo.lock") {
    return content.replace(
      /(name = "idioma"\s*\nversion = ")([^"]+)(")/,
      "$1" + newVersion + "$3",
    );
  }

  if (base === "tauri.properties") {
    return content.replace(/(appVersion=)([^\r\n]+)/, "$1" + newVersion);
  }

  if (directSet) {
    return content
      .replace(/("version"\s*:\s*")([^"]+)(")/, "$1" + newVersion + "$3")
      .replace(/(version = ")([^"]+)(")/, "$1" + newVersion + "$3")
      .replace(/(appVersion=)([^\r\n]+)/, "$1" + newVersion);
  }

  return content
    .replace('"version": "' + oldVersion + '"', '"version": "' + newVersion + '"')
    .replace('"version":"' + oldVersion + '"', '"version":"' + newVersion + '"')
    .replace('version = "' + oldVersion + '"', 'version = "' + newVersion + '"')
    .replace('appVersion=' + oldVersion, 'appVersion=' + newVersion);
}

function updateJsonVersion(content, newVersion) {
  const parsed = JSON.parse(content);
  if (!Object.prototype.hasOwnProperty.call(parsed, "version")) {
    return content;
  }
  parsed.version = newVersion;
  return JSON.stringify(parsed, null, 2) + "\n";
}

function getDefaultFiles() {
  var defaults = [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.android.conf.json",
    "src-tauri/Cargo.lock",
  ].filter(function(file) { return fs.existsSync(file); });

  var tauriProperties = "src-tauri/gen/android/tauri.properties";
  if (fs.existsSync(tauriProperties)) {
    defaults.push(tauriProperties);
  }

  return defaults;
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function printUsageAndExit() {
  console.error("Usage:");
  console.error("  node scripts/bump-version.cjs <old-version> <new-version> [files...]");
  console.error("  node scripts/bump-version.cjs --set-version <new-version> [files...]");
  process.exit(1);
}
