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
  it("does not restart a floating ActionMode from the window callback", () => {
    const source = readAndroidSource("MainActivity.kt");

    expect(source).not.toMatch(/override fun onWindowStartingActionMode\s*\(/);
    expect(source).not.toContain("startingWrappedSelectionActionMode");
    expect(source).not.toContain("webView.startActionMode(");
  });

  it("injects Amiga into the OEM-created floating menu", () => {
    const source = readAndroidSource("MainActivity.kt");
    const started = source.match(
      /override fun onActionModeStarted[\s\S]*?override fun onActionModeFinished/,
    );

    expect(started).not.toBeNull();
    expect(started[0]).toContain("mode.type == ActionMode.TYPE_FLOATING");
    expect(started[0]).toContain("translateCallback?.injectInto(mode)");
  });

  it("finishes a floating ActionMode before the Activity stays backgrounded", () => {
    const source = readAndroidSource("MainActivity.kt");
    const stopped = source.match(/override fun onStop[\s\S]*?super\.onStop\(\)/);

    expect(stopped).not.toBeNull();
    expect(stopped[0]).toContain("activeSelectionActionMode?.finish()");
    expect(stopped[0]).toContain("activeSelectionActionMode = null");
  });

  it("adds a clickable item without replacing the OEM callback", () => {
    const source = readAndroidSource("TranslateWindowCallback.kt");

    expect(source).toContain("fun injectInto(mode: ActionMode)");
    expect(source).toContain("val menu = mode.menu");
    expect(source).toContain("item.setOnMenuItemClickListener");
    expect(source).not.toContain(": ActionMode.Callback");
  });
});
