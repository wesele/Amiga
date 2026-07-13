import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const source = readFileSync(
  resolve(
    ROOT,
    "src-tauri/android/app/src/main/java/com/idioma/app/MainActivity.kt",
  ),
  "utf8",
);

describe("Android MediaStore backup startup safety", () => {
  it("keeps optional backup export off the Activity startup path", () => {
    const onCreate = source.match(
      /override fun onCreate[\s\S]*?override fun onWebViewCreate/,
    );
    const onWebViewCreate = source.match(
      /override fun onWebViewCreate[\s\S]*?override fun onDestroy/,
    );
    const guardedTask = source.match(
      /private fun runOptionalStartupTask[\s\S]*?override fun onWebViewCreate/,
    );

    expect(onCreate).not.toBeNull();
    expect(onCreate[0]).toContain('runOptionalStartupTask("restore MediaStore backup")');
    expect(onCreate[0]).not.toContain('runOptionalStartupTask("export MediaStore backup")');
    expect(onWebViewCreate).not.toBeNull();
    expect(onWebViewCreate[0]).toContain("Thread({");
    expect(onWebViewCreate[0]).toContain('runOptionalStartupTask("export MediaStore backup")');
    expect(guardedTask).not.toBeNull();
    expect(guardedTask[0]).toContain("catch (t: Throwable)");
  });

  it("updates the persisted MediaStore URI before creating another row", () => {
    const exporter = source.match(
      /private fun exportBackupToMediaStore[\s\S]*?private fun writeBackupToUri/,
    );

    expect(exporter).not.toBeNull();
    expect(exporter[0]).toContain("BACKUP_URI_KEY");
    expect(exporter[0]).toContain("writeBackupToUri(privateDb, storedUri)");
    expect(exporter[0].indexOf("writeBackupToUri(privateDb, storedUri)")).toBeLessThan(
      exporter[0].indexOf("contentResolver.insert("),
    );
    expect(source).toContain('contentResolver.openOutputStream(uri, "wt")');
  });

  it("restores the newest valid backup including auto-renamed duplicates", () => {
    const restore = source.match(
      /private fun tryRestoreFromMediaStoreBackup[\s\S]*?private fun isSqliteDatabase/,
    );

    expect(restore).not.toBeNull();
    expect(restore[0]).toContain('"$BACKUP_DISPLAY_NAME (%)"');
    expect(restore[0]).toContain("MediaStore.Downloads.DATE_MODIFIED} DESC");
    expect(restore[0]).toContain("while (cursor.moveToNext())");
    expect(restore[0]).toContain("isSqliteDatabase(restoreFile)");
  });
});
