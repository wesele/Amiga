import { describe, it, expect } from "vitest";
import {
  PATCH_BEGIN,
  PATCH_END,
  extractFragmentBody,
  mergeManifest,
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
