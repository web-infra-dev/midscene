import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Check the tarball users install, including CJS, ESM and declarations.
assert(
  process.argv[2],
  'Usage: node scripts/check-package-exports.mjs <tarball-or-directory>',
);
const input = resolve(process.argv[2]);
const tarballs = statSync(input).isDirectory()
  ? readdirSync(input)
      .filter((file) => file.endsWith('.tgz'))
      .map((file) => join(input, file))
  : [input];
assert.equal(
  tarballs.length,
  1,
  'Pass one package tarball or a directory containing exactly one tarball.',
);
const [tarball] = tarballs;
const files = new Set(
  execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .trim()
    .split('\n'),
);
const pkg = JSON.parse(
  execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  }),
);
const targets = new Set();
const collect = (value) => {
  if (typeof value === 'string') targets.add(value);
  else if (value && typeof value === 'object')
    Object.values(value).forEach(collect);
};
collect(pkg.exports);
for (const entry of [pkg.main, pkg.module, pkg.types])
  if (entry) collect(entry);
collect(pkg.bin);
const missing = [...targets].filter(
  (target) => !files.has(`package/${target.replace(/^\.\//, '')}`),
);
assert.deepEqual(
  missing,
  [],
  `${pkg.name} exports files missing from its tarball`,
);
console.log(`${pkg.name}: ${targets.size} packaged entry paths verified.`);
