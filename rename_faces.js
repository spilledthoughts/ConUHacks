const fs = require('fs');
const path = require('path');

const dir = 'captcha_faces';
// Get all image files (jpg, jpeg, png)
const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png'))
    .sort(); // Sort to maintain order

console.log(`Found ${files.length} files to rename`);

files.forEach((f, i) => {
    // Keep original extension
    const ext = path.extname(f);
    const newName = `face_${String(i + 1).padStart(2, '0')}${ext}`;
    if (f !== newName) {
        fs.renameSync(path.join(dir, f), path.join(dir, newName));
        console.log(`Renamed: ${f} -> ${newName}`);
    } else {
        console.log(`Unchanged: ${f}`);
    }
});

console.log('Done!');
