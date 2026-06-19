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
    const updated = c
      .replace(`"version": "${oldVer}"`, `"version": "${newVer}"`)
      .replace(`"version":"${oldVer}"`, `"version":"${newVer}"`)
      .replace(`version = "${oldVer}"`, `version = "${newVer}"`)
      .replace(`version: "${oldVer}"`, `version: "${newVer}"`)
      .replace(`appVersion=${oldVer}`, `appVersion=${newVer}`);
    if (updated !== c) {
      fs.writeFileSync(f, updated, 'utf8');
    }
  } catch (_) {}
}
