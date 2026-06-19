const fs = require('fs');

const oldVer = process.argv[2];
const newVer = process.argv[3];
const files = process.argv.slice(4);

if (!oldVer || !newVer || files.length === 0) {
  process.exit(1);
}

for (const f of files) {
  try {
    let c = fs.readFileSync(f, 'utf8');
    let updated;
    if (f.endsWith('Cargo.lock')) {
      updated = c.replace(
        new RegExp(`(name = "idioma"\\s*\\nversion = ")${escapeRegex(oldVer)}(")`),
        `$1${newVer}$2`
      );
    } else {
      updated = c
        .replace(`"version": "${oldVer}"`, `"version": "${newVer}"`)
        .replace(`"version":"${oldVer}"`, `"version":"${newVer}"`)
        .replace(`version = "${oldVer}"`, `version = "${newVer}"`)
        .replace(`version: "${oldVer}"`, `version: "${newVer}"`)
        .replace(`appVersion=${oldVer}`, `appVersion=${newVer}`);
    }
    if (updated !== c) {
      fs.writeFileSync(f, updated, 'utf8');
      console.log(`  Updated: ${f}`);
    } else {
      console.log(`  No change: ${f}`);
    }
  } catch (e) {
    console.log(`  Skipped: ${f} (${e.message})`);
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
