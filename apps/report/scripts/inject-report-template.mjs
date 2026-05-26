#!/usr/bin/env node
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(reportRoot, '..', '..');

const magicString = 'REPLACE_ME_WITH_REPORT_HTML';
const replacedMark = '/*REPORT_HTML_REPLACED*/';
const regExpForReplace = /\/\*REPORT_HTML_REPLACED\*\/.*/;

const srcPath = path.join(reportRoot, 'dist', 'index.html');
if (!fs.existsSync(srcPath)) {
  throw new Error(
    `Report template not found at ${srcPath}. Run "nx build @midscene/report" first.`,
  );
}

const tplFileContent = fs
  .readFileSync(srcPath, 'utf-8')
  .replaceAll(magicString, '');
assert(
  !tplFileContent.includes(magicString),
  'magic string should not be in the template file',
);
const finalContent = `${replacedMark}${JSON.stringify(tplFileContent)}`;

const corePkgDir = path.join(repoRoot, 'packages', 'core');
const corePkgJson = JSON.parse(
  fs.readFileSync(path.join(corePkgDir, 'package.json'), 'utf-8'),
);
assert(
  corePkgJson.name === '@midscene/core',
  'core package name is not @midscene/core',
);
const corePkgDistDir = path.join(corePkgDir, 'dist');

const jsFiles = fs.readdirSync(corePkgDistDir, { recursive: true });
let replacedCount = 0;
for (const file of jsFiles) {
  if (
    typeof file === 'string' &&
    (file.endsWith('.js') || file.endsWith('.mjs'))
  ) {
    const filePath = path.join(corePkgDistDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.includes(replacedMark)) {
      assert(
        regExpForReplace.test(fileContent),
        'a replaced mark is found but cannot match',
      );
      const replacedContent = fileContent.replace(
        regExpForReplace,
        () => finalContent,
      );
      fs.writeFileSync(filePath, replacedContent);
      replacedCount++;
      console.log(`Template updated in file ${filePath}`);
    } else if (fileContent.includes(magicString)) {
      const magicStringCount = (
        fileContent.match(new RegExp(magicString, 'g')) || []
      ).length;
      assert(
        magicStringCount === 1,
        'magic string shows more than once in the file, cannot process',
      );
      const replacedContent = fileContent.replace(
        `'${magicString}'`,
        () => finalContent,
      );
      fs.writeFileSync(filePath, replacedContent);
      replacedCount++;
      console.log(`Template injected into ${filePath}`);
    }
  }
}

if (replacedCount === 0) {
  throw new Error(
    'No html template marker found in @midscene/core dist; nothing to inject.',
  );
}
