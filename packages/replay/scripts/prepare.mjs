import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const localRequire = createRequire(import.meta.url);

function packageRoot(entry, name) {
  let dir = dirname(entry);
  while (dir !== parse(dir).root) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(dir, 'package.json'), 'utf8'),
      );
      if (manifest.name === name) return dir;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    dir = dirname(dir);
  }
  throw new Error(`Cannot find package root for ${name}`);
}

/** Link only this new authoring workspace; never install or change host packages. */
export function prepareDependencies(out) {
  const hostRequire = createRequire(join(process.cwd(), 'package.json'));
  const roots = {
    '@midscene/replay': fileURLToPath(new URL('../', import.meta.url)),
  };
  for (const [name, entry] of [
    ['@midscene/web', '@midscene/web/playwright'],
    ['playwright', 'playwright'],
  ]) {
    let resolved;
    try {
      resolved = hostRequire.resolve(entry);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      resolved = localRequire.resolve(entry);
    }
    roots[name] = packageRoot(resolved, name);
  }
  const versions = {};
  for (const [name, root] of Object.entries(roots)) {
    const destination = join(out, 'node_modules', name);
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(
      root,
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    versions[name] = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ).version;
  }
  writeFileSync(
    join(out, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies: versions }, null, 2)}\n`,
    { flag: 'wx' },
  );
  const verification = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await import('@midscene/replay/experimental'); await import('@midscene/web/playwright'); await import('playwright');",
    ],
    { cwd: out, encoding: 'utf8' },
  );
  if (verification.error || verification.status !== 0)
    throw new Error(
      `AUTHORING_DEPENDENCIES: ${verification.error?.message ?? verification.stderr}`,
    );
  return versions;
}
