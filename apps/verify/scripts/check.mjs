import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

for (const directory of ['src', 'scripts', 'tests', 'deploy']) {
  for (const file of await readdir(
    new URL(`../${directory}/`, import.meta.url),
  )) {
    if (!file.endsWith('.mjs')) continue;
    const result = spawnSync(
      process.execPath,
      ['--check', new URL(`../${directory}/${file}`, import.meta.url).pathname],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

for (const file of [
  'package.json',
  'config.example.json',
  'verdict.schema.json',
]) {
  JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
}
