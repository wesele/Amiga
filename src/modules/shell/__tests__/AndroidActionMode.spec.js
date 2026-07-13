import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

function readAndroidSource(file) {
  return readFileSync(
    resolve(
      ROOT,
      "src-tauri/android/app/src/main/java/com/idioma/app",
      file,
    ),
    "utf8",
  );
}

describe("Android text-selection ActionMode lifecycle", () => {
  it("wraps the OEM callback before a floating ActionMode starts", () => {
    const source = readAndroidSource("MainActivity.kt");

    expect(source).toMatch(/override fun onWindowStartingActionMode\s*\(/);
    expect(source).toContain("startingWrappedSelectionActionMode");
    expect(source).toContain("webView.startActionMode(");
    expect(source).toContain("TranslateWindowCallback(webView, callback)");
  });

  it("does not mutate the OEM menu from the started notification", () => {
    const source = readAndroidSource("MainActivity.kt");
    const started = source.match(
      /override fun onActionModeStarted[\s\S]*?override fun onActionModeFinished/,
    );

    expect(started).not.toBeNull();
    expect(started[0]).not.toContain("injectInto");
    expect(started[0]).not.toContain("mode.menu");
  });

  it("finishes a floating ActionMode before the Activity stays backgrounded", () => {
    const source = readAndroidSource("MainActivity.kt");
    const stopped = source.match(/override fun onStop[\s\S]*?super\.onStop\(\)/);

    expect(stopped).not.toBeNull();
    expect(stopped[0]).toContain("activeSelectionActionMode?.finish()");
    expect(stopped[0]).toContain("activeSelectionActionMode = null");
  });

  it("delegates the complete callback lifecycle and OEM content rect", () => {
    const source = readAndroidSource("TranslateWindowCallback.kt");

    expect(source).toContain(": ActionMode.Callback2()");
    expect(source).toContain("delegate.onCreateActionMode(mode, menu)");
    expect(source).toContain("delegate.onPrepareActionMode(mode, menu)");
    expect(source).toContain("delegate.onActionItemClicked(mode, item)");
    expect(source).toContain("delegate.onDestroyActionMode(mode)");
    expect(source).toContain("callback2.onGetContentRect(mode, view, outRect)");
  });
});
