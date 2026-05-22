#!/usr/bin/env node
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();

const fixedPaths = [
  '.nx/cache',
  'packages/playground/static',
  'packages/ios/static',
];

for (const rel of fixedPaths) {
  rmSync(join(cwd, rel), { recursive: true, force: true });
}

for (const base of ['packages', 'apps']) {
  const parent = join(cwd, base);
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const sub of ['dist', join('node_modules', '.cache')]) {
      rmSync(join(parent, entry.name, sub), { recursive: true, force: true });
    }
  }
}
