const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '../dist/script/htmlElement.js');

if (!fs.existsSync(scriptPath)) {
  console.log('htmlElement.js not found, skipping replacement.');
  process.exit();
}

const scriptContent = JSON.stringify(fs.readFileSync(scriptPath, 'utf-8'));

const filesToPatch = [
  path.resolve(__dirname, '../dist/lib/fs.js'),
  path.resolve(__dirname, '../dist/es/fs.js'),
];

filesToPatch.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const newContent = fileContent.replace(
            `{ ELEMENT_INFO_SCRIPT_CONTENT }`,
            scriptContent
        );
        fs.writeFileSync(filePath, newContent);
        console.log(`[post-build] Patched ${path.relative(path.resolve(__dirname, '..'), filePath)}`);
    } catch (e) {
        console.error(`[post-build] Error patching ${filePath}`, e);
        process.exit(1);
    }
  } else {
    console.log(`[post-build] ${path.basename(filePath)} not found, skipping patch.`);
  }
});

console.log('[post-build] Script finished successfully.'); 