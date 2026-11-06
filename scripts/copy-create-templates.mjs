import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogRoot = join(repositoryRoot, 'examples/catalog');
const destination = join(repositoryRoot, 'packages/test/dist/templates');
const manifest = JSON.parse(
  readFileSync(join(catalogRoot, 'manifest.json'), 'utf8'),
);
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.templates)) {
  throw new Error('Unsupported template manifest schema.');
}
const templates = manifest.templates.filter(
  (entry) => entry.exposure === 'create',
);
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const entry of templates) {
  if (
    typeof entry.sourceDir !== 'string' ||
    !/^test\/[a-z]+$/.test(entry.sourceDir)
  ) {
    throw new Error(`Invalid published template path: ${entry.sourceDir}`);
  }
  cpSync(
    join(catalogRoot, entry.sourceDir),
    join(destination, entry.sourceDir),
    { recursive: true },
  );
}
writeFileSync(
  join(destination, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, templates }, null, 2)}\n`,
);
