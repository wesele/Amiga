import { describe, it, expect } from "vitest";
import {
  PATCH_BEGIN,
  PATCH_END,
  PATCH_GRADLE_BEGIN,
  PATCH_GRADLE_END,
  extractFragmentBody,
  mergeManifest,
  mergeBackupAttributes,
  mergeGradleDebugSigning,
  ensureGradleKeystore,
} from "../android-patch.cjs";

// A representative copy of the manifest Tauri currently generates. We
// don't read the real gen/ tree here — that's gitignored and may not
// exist on dev machines — but it should match in shape.
const GENERATED = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- AndroidTV support -->
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.idioma"
        android:usesCleartextTraffic="\${usesCleartextTraffic}">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:windowSoftInputMode="adjustResize"
            android:launchMode="singleTask"
            android:label="@string/main_activity_title"
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
          android:name="androidx.core.content.FileProvider"
          android:authorities="\${applicationId}.fileprovider"
          android:exported="false"
          android:grantUriPermissions="true">
          <meta-data
            android:name="android.support.FILE_PROVIDER_PATHS"
            android:resource="@xml/file_paths" />
        </provider>
    </application>

</manifest>
`;

const FRAGMENT = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="http" />
        </intent>
    </queries>
</manifest>
`;

describe("extractFragmentBody", () => {
  it("returns the inner XML of the root <manifest>", () => {
    const body = extractFragmentBody(FRAGMENT);
    expect(body).toBeTruthy();
    expect(body).toContain("<queries>");
    expect(body).toContain('android:scheme="https"');
    expect(body).toContain('android:scheme="http"');
    // The body keeps the original indentation of the fragment — the
    // <manifest> tags are stripped but the leading whitespace of the
    // first child line is preserved (and [dedent] in mergeManifest
    // uses it to normalize the indent).
    expect(body).toMatch(/^\n {4}<queries>/);
    expect(body).toMatch(/\n {4}<\/queries>\n$/);
  });

  it("returns null when the root <manifest> is missing", () => {
    expect(extractFragmentBody("<queries><intent/></queries>")).toBeNull();
    expect(extractFragmentBody("")).toBeNull();
  });
});

describe("mergeManifest", () => {
  it("inserts the fragment body before </manifest> at 4-space indent", () => {
    const merged = mergeManifest(GENERATED, extractFragmentBody(FRAGMENT));
    expect(merged).not.toBe(GENERATED);
    // Markers present
    expect(merged).toContain(PATCH_BEGIN);
    expect(merged).toContain(PATCH_END);
    // Fragment body preserved
    expect(merged).toContain("<queries>");
    expect(merged).toContain('android:scheme="https"');
    expect(merged).toContain('android:scheme="http"');
    // The opening marker line is indented to match Tauri's 4-space
    // convention for top-level <manifest> children.
    expect(merged).toContain(`    ${PATCH_BEGIN}`);
    // Top-level <queries> lands at 4 spaces; nested <intent> at 8;
    // deepest <action>/<category>/<data> at 12. This is the canonical
    // Tauri/Android indent for the merged block.
    expect(merged).toMatch(/\n {4}<queries>/);
    expect(merged).toMatch(/\n {8}<intent>/);
    expect(merged).toMatch(/\n {12}<action/);
    // Closing tag is still on its own line.
    expect(merged).toMatch(/\n<\/manifest>\s*$/);
  });

  it("dedents the fragment so indentation matches the generated file", () => {
    // A fragment written with 8-space indent gets the same internal
    // increment in the output (4 + 8 = 12 for the second level).
    // The patch only normalizes the *first* level to column 4.
    const weird = `<?xml version="1.0"?>
<manifest>
        <queries>
                <intent>
                        <data android:scheme="https"/>
                </intent>
        </queries>
</manifest>
`;
    const body = extractFragmentBody(weird);
    const merged = mergeManifest(GENERATED, body);
    // <queries> lands at column 4 (matching Tauri's style).
    expect(merged).toMatch(/\n {4}<queries>/);
    // Nested levels keep their 8-space increment, shifted by the
    // 4-space top-level offset.
    expect(merged).toMatch(/\n {12}<intent>/);
    expect(merged).toMatch(/\n {20}<data/);
  });

  it("is idempotent — running twice yields the same result", () => {
    const body = extractFragmentBody(FRAGMENT);
    const once = mergeManifest(GENERATED, body);
    const twice = mergeManifest(once, body);
    expect(twice).toBe(once);
  });

  it("strips a previous patch block before re-inserting", () => {
    const body = extractFragmentBody(FRAGMENT);
    // Pretend the manifest was already patched (e.g. developer ran
    // the script once, then re-ran after changing the fragment).
    const alreadyPatched = mergeManifest(GENERATED, body);
    // Now re-merge — output should be byte-identical.
    const reMerged = mergeManifest(alreadyPatched, body);
    expect(reMerged).toBe(alreadyPatched);
    // And there must be exactly one PATCH_BEGIN marker in the output.
    const beginCount = (reMerged.match(new RegExp(PATCH_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    expect(beginCount).toBe(1);
  });

  it("replaces an outdated patch block when the fragment changes", () => {
    const bodyV1 = "<!-- v1 -->";
    const bodyV2 = "<!-- v2 -->";
    const v1 = mergeManifest(GENERATED, bodyV1);
    const v2 = mergeManifest(v1, bodyV2);
    expect(v2).not.toBe(v1);
    // v1 marker gone, v2 marker present.
    expect(v2).not.toContain("<!-- v1 -->");
    expect(v2).toContain("<!-- v2 -->");
  });

  it("returns input unchanged when the fragment is empty", () => {
    expect(mergeManifest(GENERATED, "")).toBe(GENERATED);
  });

  it("throws when the generated manifest has no </manifest> tag", () => {
    expect(() => mergeManifest("<manifest/>", "<x/>")).toThrow(/<\/manifest>/);
  });
});

describe("mergeBackupAttributes", () => {
  it("adds android:allowBackup and related attributes to the <application> tag", () => {
    const patched = mergeBackupAttributes(GENERATED);
    expect(patched).not.toBe(GENERATED);
    expect(patched).toContain('android:allowBackup="true"');
    expect(patched).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(patched).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(patched).toContain('android:hasFragileUserData="true"');
    // The attributes should appear inside the <application> tag, not after it
    const appTagMatch = patched.match(/<application[\s\S]*?>/);
    expect(appTagMatch).not.toBeNull();
    expect(appTagMatch[0]).toContain('android:allowBackup="true"');
    expect(appTagMatch[0]).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(appTagMatch[0]).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(appTagMatch[0]).toContain('android:hasFragileUserData="true"');
  });

  it("is idempotent — running twice yields the same result", () => {
    const once = mergeBackupAttributes(GENERATED);
    const twice = mergeBackupAttributes(once);
    expect(twice).toBe(once);
  });

  it("returns input unchanged when already patched", () => {
    const patched = mergeBackupAttributes(GENERATED);
    const repatched = mergeBackupAttributes(patched);
    expect(repatched).toBe(patched);
  });

  it("handles a manifest without the usesCleartextTraffic anchor (fallback path)", () => {
    const minimal = GENERATED.replace(
      'android:usesCleartextTraffic="${usesCleartextTraffic}"',
      "",
    );
    const patched = mergeBackupAttributes(minimal);
    expect(patched).toContain('android:allowBackup="true"');
    expect(patched).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(patched).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(patched).toContain('android:hasFragileUserData="true"');
  });

  it("adds hasFragileUserData when backup attrs already exist", () => {
    const partial = GENERATED.replace(
      'android:usesCleartextTraffic="${usesCleartextTraffic}">',
      'android:usesCleartextTraffic="${usesCleartextTraffic}"' +
        '\n        android:allowBackup="true"' +
        '\n        android:fullBackupContent="@xml/backup_rules"' +
        '\n        android:dataExtractionRules="@xml/data_extraction_rules">',
    );
    const patched = mergeBackupAttributes(partial);
    expect(patched).toContain('android:hasFragileUserData="true"');
    expect(patched.match(/android:allowBackup="true"/g)).toHaveLength(1);
  });
});

// A representative copy of the gradle file Tauri currently generates.
// Not read from gen/ (gitignored, may not exist); shape pinned from
// tauri-cli 2.11.2.
const GENERATED_GRADLE = `import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystoreProperties = Properties()
val keystorePropertiesFile = file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

android {
    compileSdk = 36
    namespace = "com.idioma.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.idioma.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            storeFile = keystoreProperties["storeFile"]?.toString()?.let { file(it) }
            storePassword = keystoreProperties["storePassword"]?.toString() ?: ""
            keyAlias = keystoreProperties["keyAlias"]?.toString() ?: ""
            keyPassword = keystoreProperties["keyPassword"]?.toString() ?: ""
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
}

apply(from = "tauri.build.gradle.kts")
`;

describe("mergeGradleDebugSigning", () => {
  it("injects the signingConfig assignment at the top of the debug buildType block", () => {
    const patched = mergeGradleDebugSigning(GENERATED_GRADLE);
    expect(patched).not.toBe(GENERATED_GRADLE);
    // Markers present
    expect(patched).toContain(PATCH_GRADLE_BEGIN);
    expect(patched).toContain(PATCH_GRADLE_END);
    expect(patched.indexOf(PATCH_GRADLE_BEGIN)).toBeLessThan(patched.indexOf(PATCH_GRADLE_END));
    // The signingConfig assignment is inside the patch block
    expect(patched).toContain('signingConfig = signingConfigs.getByName("release")');
    // Condition checks that a storeFile property is set before binding
    expect(patched).toContain('keystoreProperties.getProperty("storeFile") != null');
    // The patch sits inside the debug block (right after the opening
    // brace), and BEFORE the existing `manifestPlaceholders` line.
    const beginIdx = patched.indexOf(PATCH_GRADLE_BEGIN);
    const debugIdx = patched.indexOf('getByName("debug") {');
    const debugOpenBraceEndIdx = patched.indexOf("\n", debugIdx) + 1;
    expect(beginIdx).toBeGreaterThanOrEqual(debugOpenBraceEndIdx);
    const placeholdersIdx = patched.indexOf('manifestPlaceholders["usesCleartextTraffic"] = "true"');
    expect(beginIdx).toBeLessThan(placeholdersIdx);
  });

  it("indents the patch body at 12 spaces (matches the debug block level)", () => {
    const patched = mergeGradleDebugSigning(GENERATED_GRADLE);
    // BEGIN marker at 12 spaces of indent
    expect(patched).toMatch(/\n            \/\/ AMIGA-PATCH-BEGIN: debug-signing\n/);
    // The `if (keystoreProperties...)` line at 12 spaces
    expect(patched).toMatch(/\n {12}if \(keystoreProperties\.getProperty\("storeFile"\) != null\) \{\n/);
    // The inner `signingConfig = ...` line at 16 spaces (12 + 4 for the block body)
    expect(patched).toMatch(/\n {16}signingConfig = signingConfigs\.getByName\("release"\)\n/);
    // Closing brace at 12 spaces, then the END marker
    expect(patched).toMatch(/\n {12}\}\n {12}\/\/ AMIGA-PATCH-END: debug-signing\n/);
  });

  it("is idempotent — running twice yields the same result", () => {
    const once = mergeGradleDebugSigning(GENERATED_GRADLE);
    const twice = mergeGradleDebugSigning(once);
    expect(twice).toBe(once);
    // Exactly one BEGIN marker survives
    const beginCount = (twice.match(new RegExp(PATCH_GRADLE_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    expect(beginCount).toBe(1);
  });

  it("replaces any previous patch block on re-run", () => {
    const once = mergeGradleDebugSigning(GENERATED_GRADLE);
    // Pretend a prior patch was written with an obsolete body — we
    // stuff a stale marker pair then re-run.
    const stale = once.replace(
      new RegExp(`(${PATCH_GRADLE_BEGIN}\\s*)([\\s\\S]*?)(${PATCH_GRADLE_END})`),
      "$1// OLD STALE BODY$3",
    );
    // Sanity: the stale body is currently present
    expect(stale).toContain("// OLD STALE BODY");
    const repatched = mergeGradleDebugSigning(stale);
    // Stale body gone, fresh assignment present
    expect(repatched).not.toContain("// OLD STALE BODY");
    expect(repatched).toContain('signingConfig = signingConfigs.getByName("release")');
    // Patched result equals a fresh from-scratch patch (canonical form)
    const fresh = mergeGradleDebugSigning(GENERATED_GRADLE);
    expect(repatched).toBe(fresh);
  });

  it("throws when the generated gradle has no debug buildType block", () => {
    const broken = GENERATED_GRADLE.replace(/\s*getByName\("debug"\)\s*\{[\s\S]*?\n        \}/, "");
    expect(() => mergeGradleDebugSigning(broken)).toThrow(/getByName\("debug"\)/);
  });

  it("returns input unchanged when already patched", () => {
    const patched = mergeGradleDebugSigning(GENERATED_GRADLE);
    // Strip a single trailing newline (which the function appends after
    // the END marker) before re-passing is *not* needed because the
    // idempotency strip handles it; this just verifies the no-op
    // short-circuit path.
    const repatched = mergeGradleDebugSigning(patched);
    expect(repatched).toBe(patched);
  });

  it("handles CRLF line endings (Windows, default for tauri android init)", () => {
    // CRLF version of the gradle file — same byte content, every \n
    // replaced by \r\n. tauri android init on Windows produces this.
    const CRLF = GENERATED_GRADLE.replace(/\n/g, "\r\n");
    const patched = mergeGradleDebugSigning(CRLF);
    expect(patched).not.toBe(CRLF);
    // All inserted block lines must use CRLF (no stray LF).
    const PatchSlice = patched.slice(
      patched.indexOf(PATCH_GRADLE_BEGIN),
      patched.indexOf(PATCH_GRADLE_END) + PATCH_GRADLE_END.length,
    );
    // Reject any lone \n (i.e. one not preceded by \r): if present,
    // the patch block introduced mixed line endings.
    expect(PatchSlice).not.toMatch(/(?<!\r)\n/);
    // Idempotent under CRLF too.
    const twice = mergeGradleDebugSigning(patched);
    expect(twice).toBe(patched);
  });
});

// Tauri 2.11.2+ generates a simplified build.gradle.kts without the
// keystore infrastructure (import FileInputStream, keystoreProperties
// block, signingConfigs block, signingConfig assignment). This fixture
// captures that shape so we can test the ensureGradleKeystore bridge.
const GENERATED_GRADLE_V3 = `import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.idioma.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.idioma.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
}

apply(from = "tauri.build.gradle.kts")
`;

describe("ensureGradleKeystore", () => {
  it("adds import java.io.FileInputStream when missing", () => {
    const result = ensureGradleKeystore(GENERATED_GRADLE_V3);
    expect(result).toContain("import java.io.FileInputStream");
  });

  it("adds the keystoreProperties block when missing", () => {
    const result = ensureGradleKeystore(GENERATED_GRADLE_V3);
    expect(result).toContain("val keystoreProperties = Properties()");
    expect(result).toContain('val keystorePropertiesFile = file("keystore.properties")');
    expect(result).toContain("FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }");
  });

  it("adds the signingConfigs block when missing", () => {
    const result = ensureGradleKeystore(GENERATED_GRADLE_V3);
    expect(result).toContain("signingConfigs {");
    expect(result).toContain('create("release") {');
    expect(result).toContain('storeFile = keystoreProperties["storeFile"]');
  });

  it("adds signingConfig assignment to release buildType when missing", () => {
    const result = ensureGradleKeystore(GENERATED_GRADLE_V3);
    expect(result).toContain('signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")');
  });

  it("is idempotent — running twice yields the same result", () => {
    const once = ensureGradleKeystore(GENERATED_GRADLE_V3);
    const twice = ensureGradleKeystore(once);
    expect(twice).toBe(once);
  });

  it("does not duplicate on the old template (already has keystore infra)", () => {
    const result = ensureGradleKeystore(GENERATED_GRADLE);
    expect(result).toBe(GENERATED_GRADLE);
  });
});

describe("mergeGradleDebugSigning (v3 template without keystore infra)", () => {
  it("patching a v3 template succeeds (keystore infra injected first)", () => {
    const patched = mergeGradleDebugSigning(GENERATED_GRADLE_V3);
    expect(patched).toContain(PATCH_GRADLE_BEGIN);
    expect(patched).toContain(PATCH_GRADLE_END);
    expect(patched).toContain('signingConfig = signingConfigs.getByName("release")');
    expect(patched).toContain('keystoreProperties.getProperty("storeFile") != null');
    // The keystore infra was injected
    expect(patched).toContain("val keystoreProperties");
    expect(patched).toContain("signingConfigs {");
  });

  it("patching v3 is idempotent", () => {
    const once = mergeGradleDebugSigning(GENERATED_GRADLE_V3);
    const twice = mergeGradleDebugSigning(once);
    expect(twice).toBe(once);
  });
});
