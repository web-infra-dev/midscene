import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ignored = new Set([
  'node_modules',
  '.git',
  '.nx',
  'dist',
  'coverage',
  'midscene_run',
  '.midscene',
  '.trae-html-share-packages',
]);
const within = (root, path) => {
  const rel = relative(root, path);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep))
  );
};

export function inventory(root, excluded = []) {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (
        ignored.has(name) ||
        name === '.env' ||
        name.startsWith('.env.') ||
        excluded.some((path) => within(path, file))
      )
        continue;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink())
        throw new Error(
          `VERIFY_INPUT_SYMLINK: keep local input files inside the project: ${file}`,
        );
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile())
        files[relative(root, file).split(sep).join('/')] = digest(
          readFileSync(file),
        );
    }
  };
  walk(root);
  return files;
}

/** Snapshot the authored project, including helpers, fixtures, config and lockfile. */
export function freezeInputs(root, out) {
  root = realpathSync(root);
  out = realpathSync(out);
  if (root === out)
    throw new Error('Verification output cannot replace the input project.');
  const destination = join(out, 'inputs');
  const excluded = [out];
  const files = inventory(root, excluded);
  mkdirSync(destination);
  for (const file of Object.keys(files)) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    const bytes = readFileSync(join(root, file));
    if (digest(bytes) !== files[file])
      throw new Error(`VERIFY_INPUTS_CHANGED: ${file}`);
    writeFileSync(target, bytes, { flag: 'wx' });
  }
  // Runtime packages remain installed dependencies, not authored source copies.
  let dependencyRoot = root;
  while (
    !existsSync(join(dependencyRoot, 'node_modules')) &&
    dirname(dependencyRoot) !== dependencyRoot
  )
    dependencyRoot = dirname(dependencyRoot);
  if (existsSync(join(dependencyRoot, 'node_modules')))
    symlinkSync(
      realpathSync(join(dependencyRoot, 'node_modules')),
      join(destination, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  const manifest = {
    root,
    destination,
    files,
    environmentDigest: digest(
      JSON.stringify(Object.entries(process.env).sort()),
    ),
    dependencyPolicy:
      'installed packages; package manifests and lockfiles are frozen; node_modules is not a security sandbox',
  };
  writeFileSync(join(out, 'inputs.json'), JSON.stringify(manifest, null, 2));
  return {
    ...manifest,
    unchanged() {
      if (
        JSON.stringify(inventory(root, excluded)) !== JSON.stringify(files) ||
        Object.entries(files).some(
          ([file, hash]) =>
            !existsSync(join(destination, file)) ||
            digest(readFileSync(join(destination, file))) !== hash,
        )
      )
        throw new Error(
          'VERIFY_INPUTS_CHANGED: discard this group and rerun verification after editing.',
        );
    },
  };
}
