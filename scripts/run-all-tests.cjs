const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function run(name, command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: isWindows,
    });
    child.on("close", (code) => resolve({ name, code: code ?? 1 }));
    child.on("error", (error) => {
      console.error(`[${name}] failed to start: ${error.message}`);
      resolve({ name, code: 1 });
    });
  });
}

async function main() {
  const npm = isWindows ? "npm.cmd" : "npm";
  const cargo = isWindows ? "cargo.exe" : "cargo";
  const results = await Promise.all([
    run("frontend", npm, ["test"], root),
    run("backend", cargo, ["test"], path.join(root, "src-tauri")),
  ]);

  const failed = results.filter((result) => result.code !== 0);
  if (failed.length > 0) {
    for (const result of failed) {
      console.error(`${result.name} exited with code ${result.code}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
