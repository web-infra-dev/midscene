import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerCommands } from '../packages/test/src/cli/create-package-manager';
import {
  loadTemplateManifest,
  renderTemplate,
} from '../packages/test/src/cli/template-renderer';

interface GenerationRecord {
  schemaVersion: 1;
  sourceCommit: string;
  midsceneVersion: string;
  packageManager: 'npm' | 'pnpm';
  managedFiles: Record<string, string>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogRoot = join(root, 'examples/catalog');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage: pnpm examples:sync --target <midscene-example> [--check] [--version <published-version>] [--package-manager npm|pnpm]',
  );
  process.exit(0);
}
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const targetArg = option('--target');
if (!targetArg) throw new Error('--target is required.');
const target = resolve(targetArg);
const statIfPresent = (path: string) => {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};
const targetStat = statIfPresent(target);
if (targetStat && !targetStat.isDirectory()) {
  throw new Error(`Example target is not a directory: ${target}`);
}
const check = args.includes('--check');
const metadataPath = join(target, '.midscene-generation.json');
const metadataStat = statIfPresent(metadataPath);
if (metadataStat && !metadataStat.isFile()) {
  throw new Error(`Generation metadata is not a regular file: ${metadataPath}`);
}
const previous: GenerationRecord | undefined = metadataStat
  ? JSON.parse(readFileSync(metadataPath, 'utf8'))
  : undefined;
if (
  previous &&
  (previous.schemaVersion !== 1 ||
    typeof previous.sourceCommit !== 'string' ||
    typeof previous.midsceneVersion !== 'string' ||
    !previous.managedFiles ||
    typeof previous.managedFiles !== 'object')
) {
  throw new Error('Invalid example generation metadata.');
}
const version =
  option('--version') ?? (check ? previous?.midsceneVersion : undefined);
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Pass the published Midscene version with --version.');
}
const packageManager =
  option('--package-manager') ?? previous?.packageManager ?? 'pnpm';
if (packageManager !== 'npm' && packageManager !== 'pnpm') {
  throw new Error(`Unsupported package manager: ${packageManager}`);
}
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const dirtySources = execFileSync(
  'git',
  [
    'status',
    '--porcelain',
    '--',
    'examples/catalog',
    'packages/test/src/cli/create-template.ts',
    'packages/test/src/cli/template-renderer.ts',
    'packages/test/src/cli/create-package-manager.ts',
    'scripts/sync-examples.ts',
  ],
  { cwd: root, encoding: 'utf8' },
).trim();
if (dirtySources) {
  throw new Error(
    'Commit template and renderer changes before syncing examples so sourceCommit identifies the generated content.',
  );
}
if (check && previous?.sourceCommit !== sourceCommit) {
  throw new Error(
    `This checkout is ${sourceCommit}; use the recorded source commit ${previous?.sourceCommit ?? '(missing)'} to check generated examples.`,
  );
}
const commands = packageManagerCommands[packageManager];
const manifest = loadTemplateManifest(catalogRoot);
const expected: Record<string, Buffer> = {};
for (const entry of manifest.templates) {
  const files = renderTemplate(catalogRoot, entry, {
    PROJECT_NAME: entry.projectName,
    MIDSCENE_VERSION: version,
    INSTALL_COMMAND: `${packageManager} ${commands.install.join(' ')}`,
    RUN_NODES_COMMAND: `${packageManager} run nodes`,
    TEST_COMMAND: `${packageManager} test`,
    CHROMIUM_INSTALL_COMMAND: commands.installChromium,
  });
  for (const [filename, data] of Object.entries(files)) {
    const path = `${entry.examplePath}/${filename}`;
    if (expected[path]) throw new Error(`Duplicate generated file: ${path}`);
    expected[path] = data;
  }
}
const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');
const record: GenerationRecord = {
  schemaVersion: 1,
  sourceCommit,
  midsceneVersion: version,
  packageManager,
  managedFiles: Object.fromEntries(
    Object.entries(expected)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, data]) => [path, digest(data)]),
  ),
};
const metadata = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);

function safeFile(path: string): string {
  const absolute = resolve(target, path);
  let parent = dirname(absolute);
  while (parent.startsWith(`${target}${sep}`)) {
    const stat = statIfPresent(parent);
    if (stat && !stat.isDirectory()) {
      throw new Error(`Generated path has a non-directory parent: ${parent}`);
    }
    parent = dirname(parent);
  }
  const stat = statIfPresent(absolute);
  if (stat && !stat.isFile()) {
    throw new Error(`Generated path is not a regular file: ${absolute}`);
  }
  return absolute;
}

const generatedEntries = new Set([
  'node_modules',
  'midscene_run',
  '.env',
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
]);

function currentFiles(
  directory: string,
  prefix: string,
  projectRoot = true,
): string[] {
  const stat = statIfPresent(directory);
  if (!stat) return [];
  if (!stat.isDirectory()) {
    throw new Error(`Generated project path is not a directory: ${directory}`);
  }
  const files: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (
      projectRoot &&
      (generatedEntries.has(item.name) ||
        /^midscene-node-spec\.[^.]+\.md$/.test(item.name))
    ) {
      continue;
    }
    const path = join(directory, item.name);
    const name = `${prefix}/${item.name}`;
    if (item.isDirectory()) files.push(...currentFiles(path, name, false));
    else if (item.isFile()) files.push(name);
    else throw new Error(`Unsupported file in generated project: ${name}`);
  }
  return files;
}

const actualPaths = new Set(
  manifest.templates.flatMap((entry) =>
    currentFiles(join(target, entry.examplePath), entry.examplePath),
  ),
);
const unexpected = [...actualPaths].filter((path) => !expected[path]);
const changed = Object.entries(expected)
  .filter(([path, data]) => {
    const absolute = safeFile(path);
    return !statIfPresent(absolute) || !readFileSync(absolute).equals(data);
  })
  .map(([path]) => path);
const metadataChanged =
  !metadataStat || !readFileSync(metadataPath).equals(metadata);

if (check) {
  if (changed.length || unexpected.length || metadataChanged) {
    throw new Error(
      `Generated examples differ: ${changed.length} missing/changed, ${unexpected.length} unexpected, metadata ${metadataChanged ? 'changed' : 'current'}.\n${[...changed, ...unexpected].join('\n')}`,
    );
  }
  console.log(
    `Checked ${Object.keys(expected).length} generated files in ${target}`,
  );
} else {
  if (unexpected.length) {
    const changedByUser = unexpected.filter((path) => {
      const priorHash = previous?.managedFiles[path];
      return !priorHash || digest(readFileSync(safeFile(path))) !== priorHash;
    });
    if (changedByUser.length) {
      throw new Error(
        `Unmanaged or modified files in generated projects:\n${changedByUser.join('\n')}`,
      );
    }
  }
  const conflicts = changed.filter((path) => {
    const absolute = safeFile(path);
    if (!statIfPresent(absolute)) return false;
    const priorHash = previous?.managedFiles[path];
    return !priorHash || digest(readFileSync(absolute)) !== priorHash;
  });
  if (conflicts.length) {
    throw new Error(
      `Modified generated files require review:\n${conflicts.join('\n')}`,
    );
  }
  for (const path of unexpected) rmSync(safeFile(path));
  mkdirSync(target, { recursive: true });
  for (const [path, data] of Object.entries(expected)) {
    const absolute = safeFile(path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, data);
  }
  writeFileSync(metadataPath, metadata);
  console.log(
    `Synced ${Object.keys(expected).length} generated files to ${target}`,
  );
}
