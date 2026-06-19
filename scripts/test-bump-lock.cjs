const fs = require('fs');

const oldVer = '0.2.1';
const newVer = '0.3.0';
const lockFile = 'src-tauri/Cargo.lock';

let c = fs.readFileSync(lockFile, 'utf8');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const updated = c.replace(
  new RegExp(`(name = "idioma"\\s*\\nversion = ")${escapeRegex(oldVer)}(")`),
  `$1${newVer}$2`
);

if (updated !== c) {
  console.log('Cargo.lock: would update idioma from', oldVer, 'to', newVer);
  const idiomaIdx = updated.indexOf('name = "idioma"');
  console.log(updated.substring(idiomaIdx, idiomaIdx + 100));
  const countOld = updated.split('version = "' + oldVer + '"').length - 1;
  console.log('Remaining occurrences of', oldVer, ':', countOld);
} else {
  console.log('Cargo.lock: no match for idioma +', oldVer);
}
