const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

  try {
    // 1. Version Bump
    console.log('[1/10] Reading current version...');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const curVer = packageJson.version;
    console.log(`  Current: ${curVer}`);

    let newVer = curVer;
    const parts = curVer.split('.').map(Number);

    if (bumpMode === 'minor') {
      newVer = `${parts[0]}.${parts[1] + 1}.0`;
    } else if (bumpMode === 'major') {
      newVer = `${parts[0] + 1}.0.0`;
    } else if (bumpMode === 'patch') {
      newVer = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
    console.log(`  New:     ${newVer}  (mode: ${bumpMode})\n`);

    if (dryRun) {
      console.log('[DRY RUN] Would bump to ' + newVer + ' and publish.');
      process.exit(0);
    }

    // 2. Update version files
    console.log('[2/10] Updating version in config files...');
    
    // Use child_process to run the bump script for safety and isolation
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

    const version = newVer;
    const tag = `v${version}`;

    // 3. Dependencies check
    console.log('[3/10] Checking dependencies...');
    execSync('gh --version', { stdio: 'ignore' });
    execSync('gh auth status', { stdio: 'ignore' });
    if (!fs.existsSync('src-tauri/amiga-release.keystore')) throw new Error('Release keystore not found');
    if (!fs.existsSync('src-tauri/gen/android/app/keystore.properties')) throw new Error('keystore.properties not found');

    // 4. Confirm
    console.log(`\nThis will build and publish version ${version} to GitHub.`);
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

    // 5. Git Commit
    console.log('\n[4/10] Committing version bump...');
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "Bump version to ${version}"`, { stdio: 'inherit' });
    try {
      execSync('git push', { stdio: 'inherit' });
    } catch (e) {
      console.log('[WARNING] Git push failed. Continuing anyway...');
    }

    // 6. Build Frontend
    console.log('\n[5/10] Building frontend...');
    execSync('npm run build', { stdio: 'inherit' });

    // 7. Build Windows
    console.log('\n[6/10] Building Windows release...');
    execSync('npm run tauri build', { stdio: 'inherit' });

    // 8. Build Android
    console.log('\n[7/10] Building Android APK...');
    execSync('npx tauri android build --target aarch64 --apk', { stdio: 'inherit' });

    // 9. Release Notes
    console.log('\n[8/10] Generating release notes...');
    const notesFile = path.join(process.env.TEMP || '/tmp', `amiga-release-notes-${version}.md`);
    const notes = `## v${version}\n\n版本 ${version} 发布。\n\n---ENGLISH---\n\n## v${version}\n\nVersion ${version} release.`;
    fs.writeFileSync(notesFile, notes, 'utf8');

    // 10. Collect Artifacts
    console.log('[9/10] Collecting build artifacts...');
    let artifacts = [];
    
    const nsisDir = 'src-tauri/target/release/bundle/nsis';
    if (fs.existsSync(nsisDir)) {
      fs.readdirSync(nsisDir).forEach(f => {
        if (f.endsWith('.exe')) artifacts.push(path.join(nsisDir, f));
      });
    }

    if (artifacts.length === 0) {
      const msiDir = 'src-tauri/target/release/bundle/msi';
      if (fs.existsSync(msiDir)) {
        fs.readdirSync(msiDir).forEach(f => {
          if (f.endsWith('.msi')) artifacts.push(path.join(msiDir, f));
        });
      }
    }

    if (fs.existsSync('src-tauri/target/release/idioma.exe')) {
      artifacts.push('src-tauri/target/release/idioma.exe');
    }

    const apkDir = 'src-tauri/gen/android/app/build/outputs/apk';
    if (fs.existsSync(apkDir)) {
      // recursive search for -release.apk
      const findApks = (dir) => {
        fs.readdirSync(dir).forEach(file => {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) findApks(fullPath);
          else if (file.endsWith('-release.apk')) artifacts.push(fullPath);
        });
      };
      findApks(apkDir);
    }

    if (artifacts.length === 0) {
      console.log('[WARNING] No build artifacts found. Creating tag-only release.');
    }

    // 11. Publish
    console.log('[10/10] Publishing to GitHub...');
    const artifactString = artifacts.map(a => `"${a}"`).join(' ');
    execSync(`gh release create "${tag}" --title "v${version}" --notes-file "${notesFile}" ${artifactString}`, { stdio: 'inherit' });

    fs.unlinkSync(notesFile);
    console.log('\n============================================');
    console.log(`  Release v${version} published successfully!`);
    console.log('============================================\n');

  } catch (err) {
    console.error('\n[FATAL ERROR]', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

run();
