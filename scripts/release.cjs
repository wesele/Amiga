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

function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1;
    if (p1[i] < p2[i]) return -1;
  }
  return 0;
}

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
      console.log('[1/7] Determining base version...');
      
      // Get version from package.json
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const localVer = packageJson.version;
      
      // Get version from GitHub
      let ghVer = null;
      try {
        const latestTag = execSync('gh release view --json tagName --template "{{.tagName}}"', { encoding: 'utf8' }).trim();
        ghVer = latestTag.replace(/^v/, '');
      } catch (e) {
        console.log('  No GitHub release found.');
      }

      // Use the maximum of the two as the base
      let curVer = localVer;
      if (ghVer && compareVersions(ghVer, localVer) > 0) {
        curVer = ghVer;
        console.log(`  GitHub version (${ghVer}) is newer than local (${localVer}). Using GitHub as base.`);
      } else if (ghVer) {
        console.log(`  Local version (${localVer}) is up-to-date or newer than GitHub (${ghVer}).`);
      } else {
        console.log(`  Using local version as base: ${localVer}`);
      }

      console.log(`  Base Version: ${curVer}`);

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

      // To ensure bump-version.cjs works, we must pass the version that's ACTUALLY in the files.
      // Since we might have bumped GitHub base higher than local, 
      // we should first sync all files to curVer if they aren't already.
      
      // 1a. Sync all files to curVer (the determined base)
      // This prevents the "nothing to replace" issue when GitHub base > Local base
      const filesToSync = [
        'package.json', 
        'src-tauri/Cargo.toml', 
        'src-tauri/tauri.conf.json', 
        'src-tauri/Cargo.lock'
      ];
      if (fs.existsSync('src-tauri/gen/android/tauri.properties')) {
        filesToSync.push('src-tauri/gen/android/tauri.properties');
      }
      const modules = ['wizard', 'vocab', 'shell', 'prompts', 'profile', 'news', 'chat', 'hello'];
      modules.forEach(m => {
        const p = `src/modules/${m}/index.js`;
        if (fs.existsSync(p)) filesToSync.push(p);
      });

      // We don't have a simple "force set version" script, but we can use a temporary dummy version
      // or just rely on the fact that most files are already at localVer.
      // The safest way is to bump from localVer -> newVer if localVer is the actual content.
      
      // Correct logic: the files currently contain localVer. We want them to contain newVer.
      // If we just use (localVer, newVer), it will work regardless of what GitHub says.
      execSync(`node scripts/bump-version.cjs "${localVer}" "${newVer}" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`, { stdio: 'inherit' });
      execSync(`node scripts/bump-version.cjs "${localVer}" "${newVer}" src-tauri/Cargo.lock`, { stdio: 'inherit' });
      
      if (fs.existsSync('src-tauri/gen/android/tauri.properties')) {
        execSync(`node scripts/bump-version.cjs "${localVer}" "${newVer}" src-tauri/gen/android/tauri.properties`, { stdio: 'inherit' });
      }

      for (const m of modules) {
        const p = `src/modules/${m}/index.js`;
        if (fs.existsSync(p)) {
          execSync(`node scripts/bump-version.cjs "${localVer}" "${newVer}" "${p}"`, { stdio: 'inherit' });
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
