const fs = require('fs');
const c = fs.readFileSync('src-tauri/Cargo.lock', 'utf8');

const searchVer = '0.2.1';
const pattern = 'version = "' + searchVer + '"';
const count = c.split(pattern).length - 1;
console.log('Occurrences of', pattern, ':', count);

let idx = 0;
let occ = 0;
while ((idx = c.indexOf(pattern, idx)) !== -1) {
  const before = c.substring(Math.max(0, idx - 100), idx + 30);
  console.log('--- Occurrence', ++occ, '---');
  console.log(before);
  idx += pattern.length;
}
