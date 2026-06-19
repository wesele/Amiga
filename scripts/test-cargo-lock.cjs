const fs = require('fs');
const c = fs.readFileSync('src-tauri/Cargo.lock', 'utf8');
const ver = '0.3.0';
const pattern = 'version = "' + ver + '"';
const count = c.split(pattern).length - 1;
console.log('Occurrences of', pattern, ':', count);

const idiomaIdx = c.indexOf('name = "idioma"');
if (idiomaIdx !== -1) {
  const sub = c.substring(idiomaIdx, idiomaIdx + 200);
  console.log('Idioma entry:', sub);
} else {
  console.log('idioma package NOT found');
}

const firstIdx = c.indexOf(pattern);
if (firstIdx !== -1) {
  const before = c.substring(Math.max(0, firstIdx - 80), firstIdx + 30);
  console.log('First occurrence context:', before);
}
