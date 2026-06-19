const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { performance } = require('perf_hooks');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
  console.log('============================================');
  console.log('  Amiga - GitHub Release Publisher (Node)');
  console.log('============================================\n');

  const args = process.argv.slice(2);
  let bumpMode = 'patch';
  let dryRun = false;
  let confirmed = false;
  const timings = {};

  if (args.length === 0) {
    confirmed = true;
  }

  for (const arg of args) {
    if (arg === '--minor') bumpMode = 'minor';
    if (arg === '--major') bumpMode = 'major';
    if (arg === '--none') bumpMode = 'none';
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--confirm') confirmed = true;
  }

  const trackStep = async (name, fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    timings[name] = ((end - start) / 1000).toFixed(2);
    return result;
  };

  try {
    // 1. Version Bump
    await trackStep('Version Bump', async () => {
      console.log('[1/7] Determining base version from GitHub...');
      let curVer;
      try {
        const latestTag = execSync('gh release view --json tagName --template "{{.tagName}}"', { encoding: 'utf8' }).trim();
        curVer = latestTag.replace(/^v/, '');
        console.log(`  Latest GitHub Release: ${latestTag} -> Base: ${curVer}`);
      } catch (e) {
        console.log('  No GitHub release found. Falling back to package.json...');
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        curVer = packageJson.version;
      }

      let newVer = curVer;
      const parts = curVer.split('.').map(Number);

      if (bumpMode === 'minor') {
        newVer = `${parts[0]}.${parts[1] + 1}.0`;
      } else if (bumpMode === 'major') {
        newVer = `${parts[0] + 1}.0.0`;
      } else if (bumpMode === 'patch') {
        newVer = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
      }
      console.log(`  Calculated New Version: ${newVer}  (mode: ${bumpMode})\n`);

      if (dryRun) {
        console.log('[DRY RUN] Would bump to ' + newVer + ' and publish.');
        process.exit(0);
      }

      // Update version files
      execSync(`node scripts/bump-version.cjs "${curVer}" "${newVer}" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`, { stdio: 'inherit' });
      execSync(`node scripts/bump-version.cjs "${curVer}" "${newVer}" src-tauri/Cargo.lock`, { stdio: 'inherit' });
      
      if (fs.existsSync('src-tauri/gen/android/tauri.properties')) {
        execSync(`node scripts/bump-version.cjs "${curVer}" "${newVer}" src-tauri/gen/android/tauri.properties`, { stdio: 'inherit' });
      }

      const modules = ['wizard', 'vocab', 'shell', 'prompts', 'profile', 'news', 'interaction', 'hello'];
      for (const m of modules) {
        const p = `src/modules/${m}/index.js`;
        if (fs.existsSync(p)) {
          execSync(`node scripts/bump-version.cjs "${curVer}" "${newVer}" "${p}"`, { stdio: 'inherit' });
        }
      }
      
      global.releaseVersion = newVer;
      global.releaseTag = `v${newVer}`;
    });

    const version = global.releaseVersion;
    const tag = global.releaseTag;

    // 2. Dependencies check
    await trackStep('Dependencies Check', async () => {
      console.log('[2/7] Checking dependencies...');
      execSync('gh --version', { stdio: 'ignore' });
      execSync('gh auth status', { stdio: 'ignore' });
      if (!fs.existsSync('src-tauri/amiga-release.keystore')) throw new Error('Release keystore not found');
      if (!fs.existsSync('src-tauri/gen/android/app/keystore.properties')) throw new Error('keystore.properties not found');
    });

    // 3. Confirm
    await trackStep('Confirmation', async () => {
      console.log(`\nThis will build and publish Android APK version ${version} to GitHub.`);
      console.log(`Tag: ${tag}\n`);
      if (!confirmed) {
        const ans = await question('Continue? (y/N) ');
        if (ans.toLowerCase() !== 'y') {
          console.log('Cancelled.');
          process.exit(0);
        }
      } else {
        console.log('[--confirm] Auto-confirming...');
      }
    });

    // 4. Git Commit
    await trackStep('Git Commit', async () => {
      console.log('\n[3/7] Committing version bump...');
      execSync('git add -A', { stdio: 'inherit' });
      execSync(`git commit -m "Bump version to ${version}"`, { stdio: 'inherit' });
      try {
        execSync('git push', { stdio: 'inherit' });
      } catch (e) {
        console.log('[WARNING] Git push failed. Continuing anyway...');
      }
    });

    // 5. Build Frontend
    await trackStep('Frontend Build', async () => {
      console.log('\n[4/7] Building frontend...');
      execSync('npm run build', { stdio: 'inherit' });
    });

    // 6. Build Android APK
    await trackStep('Android Build', async () => {
      console.log('\n[5/7] Building Android APK (aarch64)...');
      execSync('npx tauri android build --target aarch64 --apk', { stdio: 'inherit' });
    });

    // 7. Create GitHub Release
    await trackStep('GitHub Release', async () => {
      console.log('\n[6/7] Generating release notes...');
      const notesFile = path.join(process.env.TEMP || '/tmp', `amiga-release-notes-${version}.md`);
      const notes = `## v${version}\n\n版本 ${version} 发布 (Android APK)。\n\n---ENGLISH---\n\n## v${version}\n\nVersion ${version} release (Android APK).`;
      fs.writeFileSync(notesFile, notes, 'utf8');

      console.log('[7/7] Collecting and renaming build artifacts...');
      let artifacts = [];
      
      const apkDir = 'src-tauri/gen/android/app/build/outputs/apk';
      if (fs.existsSync(apkDir)) {
        const findAndRenameApks = (dir) => {
          fs.readdirSync(dir).forEach(file => {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
              findAndRenameApks(fullPath);
            } else if (file.endsWith('-release.apk')) {
              const newFileName = `amiga-v${version}.apk`;
              const newPath = path.join(dir, newFileName);
              fs.renameSync(fullPath, newPath);
              artifacts.push(newPath);
            }
          });
        };
        findAndRenameApks(apkDir);
      }

      if (artifacts.length === 0) {
        console.log('[WARNING] No Android APK found. Creating tag-only release.');
      }

      const artifactString = artifacts.map(a => `"${a}"`).join(' ');
      execSync(`gh release create "${tag}" --title "v${version}" --notes-file "${notesFile}" ${artifactString}`, { stdio: 'inherit' });

      fs.unlinkSync(notesFile);
    });

    console.log('\n============================================');
    console.log(`  Release v${version} published successfully!`);
    console.log('--------------------------------------------');
    console.log('Step Timings:');
    Object.entries(timings).forEach(([step, time]) => {
      console.log(`  ${step.padEnd(20)} : ${time}s`);
    });
    const total = Object.values(timings).reduce((a, b) => parseFloat(a) + parseFloat(b), 0).toFixed(2);
    console.log(`  Total Time            : ${total}s`);
    console.log('============================================\n');

  } catch (err) {
    console.error('\n[FATAL ERROR]', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

run();
