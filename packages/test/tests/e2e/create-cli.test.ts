import { execFile } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateServices,
  runCreateCommand,
} from '../../src/cli/create-command';
import { createPlatforms } from '../../src/cli/create-template';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(__dirname, '../..');
const temporaryDirectories: string[] = [];
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), 'midscene-create-e2e-'));
  temporaryDirectories.push(path);
  return path;
};
const io = () => ({ log: vi.fn(), error: vi.fn() });
const services = (cwd: string): CreateServices => ({
  cwd,
  interactive: false,
  promptDirectory: async () => {
    throw new Error('Unexpected prompt');
  },
  selectPlatform: vi.fn(async () => {
    throw new Error('Unexpected platform prompt');
  }),
  runPnpm: async () => {
    throw new Error('Unexpected pnpm invocation');
  },
});
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Exercise real generated configs and the built CLI using local dependencies.
// No registry, browser, device, or model is needed to describe a new project.
const linkDependencies = (root: string) => {
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '@midscene'), { recursive: true });
  for (const name of ['test', 'android', 'ios', 'web-integration']) {
    symlinkSync(
      resolve(packageRoot, '..', name),
      join(modules, '@midscene', name === 'web-integration' ? 'web' : name),
      'dir',
    );
  }
  for (const name of ['playwright', '@types', 'typescript']) {
    symlinkSync(
      join(packageRoot, 'node_modules', name),
      join(modules, name),
      'dir',
    );
  }
  symlinkSync(
    resolve(packageRoot, '../core/node_modules/dotenv'),
    join(modules, 'dotenv'),
    'dir',
  );
  mkdirSync(join(modules, '.bin'));
  symlinkSync(
    join(packageRoot, 'bin/midscene-test'),
    join(modules, '.bin/midscene-test'),
  );
};

describe('generated project integration', () => {
  it.each(createPlatforms)(
    'describes and type-checks the %s template without runtime resources',
    async (platform) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPnpm = async (args, root) => {
        if (args[0] === 'install') {
          linkDependencies(root);
          return '';
        }
        const result = await execFileAsync(
          'pnpm',
          ['exec', 'midscene-test', 'describe-nodes'],
          { cwd: root },
        );
        return result.stdout;
      };
      await runCreateCommand(['.', '--platform', platform], io(), runtime);
      const markdown = readFileSync(join(cwd, 'midscene-nodes.md'), 'utf8');
      expect(markdown).toContain('## `aiAssert`');
      expect(markdown).toContain(
        platform === 'web' ? '## `gotoUrl`' : '## `launch`',
      );
      expect(existsSync(join(cwd, 'midscene_run'))).toBe(false);
      await execFileAsync(process.execPath, [
        join(packageRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        cwd,
      ]);
    },
    30000,
  );

  it.each(['esm', 'cjs'])(
    'includes an external %s package in the real Node reference',
    async (format) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPnpm = async (args, root) => {
        if (args[0] === 'install') {
          linkDependencies(root);
          const pkg = join(root, 'node_modules', 'team-nodes');
          mkdirSync(pkg);
          writeFileSync(
            join(pkg, 'package.json'),
            JSON.stringify({
              name: 'team-nodes',
              main: format === 'esm' ? 'index.mjs' : 'index.cjs',
              types: 'index.d.ts',
            }),
          );
          writeFileSync(
            join(pkg, format === 'esm' ? 'index.mjs' : 'index.cjs'),
            `${format === 'esm' ? 'export function createMidsceneTestNodes' : 'exports.createMidsceneTestNodes = function'}(options) {
          if (options.platform !== 'web') throw new Error('Unsupported platform');
          return [{ name: 'team.inspect', description: 'Inspect the screen.', async execute(ctx) { return (await options.getAgent(ctx)).aiAsk('Describe the screen'); } }];
        }`,
          );
          writeFileSync(
            join(pkg, 'index.d.ts'),
            `import type { NodeDefinition } from '@midscene/test';
import type { NodePackageOptions } from '@midscene/test/config';
export declare function createMidsceneTestNodes<TContext>(options: NodePackageOptions<TContext>): NodeDefinition<unknown, unknown, TContext>[];
`,
          );
          return '';
        }
        return (
          await execFileAsync(
            process.execPath,
            [join(packageRoot, 'bin/midscene-test'), 'describe-nodes'],
            { cwd: root },
          )
        ).stdout;
      };
      await runCreateCommand(
        ['.', '--platform', 'web', '--with', 'team-nodes@1.0.0'],
        io(),
        runtime,
      );
      expect(readFileSync(join(cwd, 'midscene-nodes.md'), 'utf8')).toContain(
        '## `team.inspect`',
      );
      await execFileAsync(process.execPath, [
        join(packageRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        cwd,
      ]);
    },
    30000,
  );

  it.each([
    ['missing factory', 'export const nodes = [];'],
    [
      'async factory',
      'export async function createMidsceneTestNodes() { return []; }',
    ],
    [
      'duplicate Node',
      "export function createMidsceneTestNodes() { return [{ name: 'aiAsk', execute() {} }]; }",
    ],
    [
      'invalid Node',
      "export function createMidsceneTestNodes() { return [{ name: 'team.invalid' }]; }",
    ],
  ])(
    'reports an external package with %s and preserves the project',
    async (_, source) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPnpm = async (args, root) => {
        if (args[0] === 'install') {
          linkDependencies(root);
          const pkg = join(root, 'node_modules', 'broken-nodes');
          mkdirSync(pkg);
          writeFileSync(
            join(pkg, 'package.json'),
            JSON.stringify({ name: 'broken-nodes', main: 'index.mjs' }),
          );
          writeFileSync(join(pkg, 'index.mjs'), source);
          return '';
        }
        return (
          await execFileAsync(
            process.execPath,
            [join(packageRoot, 'bin/midscene-test'), 'describe-nodes'],
            { cwd: root },
          )
        ).stdout;
      };
      const output = io();
      await expect(
        runCreateCommand(
          ['.', '--platform', 'web', '--with', 'broken-nodes'],
          output,
          runtime,
        ),
      ).rejects.toThrow('Node reference generation failed');
      expect(existsSync(join(cwd, 'midscene.config.ts'))).toBe(true);
      expect(existsSync(join(cwd, 'midscene-nodes.md'))).toBe(false);
      expect(output.log.mock.calls.flat().join('\n')).not.toContain(
        'Project ready',
      );
    },
  );

  it.skipIf(process.platform === 'win32')(
    'runs the built create command through pnpm installation and description',
    async () => {
      const cwd = temp();
      const root = join(cwd, 'project with spaces');
      linkDependencies(root);
      const bin = join(cwd, 'bin');
      mkdirSync(bin);
      // Substitute only package installation; description runs the actual built CLI.
      const launcher = join(bin, 'pnpm');
      writeFileSync(
        launcher,
        `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(cwd, 'commands.log'))}, JSON.stringify(args) + '\\n');
if (args[0] === 'install') process.exit(0);
const result = spawnSync(process.execPath, [${JSON.stringify(join(packageRoot, 'bin/midscene-test'))}, ...args.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      );
      chmodSync(launcher, 0o755);
      const result = await execFileAsync(
        process.execPath,
        [
          join(packageRoot, 'bin/midscene-test'),
          'create',
          root,
          '--platform',
          'web',
        ],
        {
          cwd,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        },
      );
      expect(result.stdout).toContain('Project ready:');
      expect(readFileSync(join(root, 'midscene-nodes.md'), 'utf8')).toContain(
        '## `gotoUrl`',
      );
      expect(
        readFileSync(join(cwd, 'commands.log'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toEqual([
        ['install', '--ignore-workspace'],
        ['exec', 'midscene-test', 'describe-nodes'],
      ]);
    },
  );
});
