import { execFile } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateServices,
  runCreateCommand,
} from '../../src/cli/create-command';
import { createPackageManagers } from '../../src/cli/create-package-manager';
import {
  createPlatforms,
  createProjectFiles,
} from '../../src/cli/create-template';

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
  confirmInstall: vi.fn(async () => true),
  userAgent: 'pnpm/9.15.0 npm/? node/v22.19.0',
  selectPackageManager: vi.fn(async (defaultValue) => defaultValue),
  promptDirectory: async () => {
    throw new Error('Unexpected prompt');
  },
  selectPlatform: vi.fn(async () => {
    throw new Error('Unexpected platform prompt');
  }),
  runPackageManager: async () => {
    throw new Error('Unexpected package manager invocation');
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
  for (const name of [
    'test',
    'android',
    'ios',
    'harmony',
    'computer',
    'web-integration',
  ]) {
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

// Copy the Web package so its optional peers cannot resolve through the
// workspace's devDependencies. Only the generated manifest supplies peers.
const isolateWebDependency = (root: string) => {
  const source = resolve(packageRoot, '../web-integration');
  const destination = join(root, 'node_modules/@midscene/web');
  const manifest = JSON.parse(
    readFileSync(join(source, 'package.json'), 'utf8'),
  );
  const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  unlinkSync(destination);
  mkdirSync(destination);
  cpSync(join(source, 'package.json'), join(destination, 'package.json'));
  cpSync(join(source, 'dist'), join(destination, 'dist'), { recursive: true });
  const dependencies = new Set([
    ...Object.keys(manifest.dependencies),
    ...Object.keys(manifest.peerDependencies).filter(
      (name) => project.devDependencies[name],
    ),
  ]);
  for (const name of dependencies) {
    const target = join(destination, 'node_modules', name);
    mkdirSync(resolve(target, '..'), { recursive: true });
    symlinkSync(join(source, 'node_modules', name), target, 'dir');
  }
};

describe('generated project integration', () => {
  it.each(createPackageManagers)(
    'generates and refreshes the reference on a manual %s install after skipping installation',
    async (packageManager) => {
      const cwd = temp();
      const root = join(cwd, 'manual install');
      const runtime = services(cwd);
      await runCreateCommand(
        [
          root,
          '--platform',
          'web',
          '--package-manager',
          packageManager,
          '--skip-install',
        ],
        io(),
        runtime,
      );
      expect(existsSync(join(root, 'midscene-nodes.md'))).toBe(false);

      // Install a local CLI launcher instead of registry dependencies. This
      // exercises real npm/pnpm install lifecycles with the generated scripts
      // and actual describe-nodes command, without network or runtime resources.
      const launcher = join(cwd, 'cli-fixture');
      mkdirSync(launcher);
      writeFileSync(
        join(launcher, 'package.json'),
        JSON.stringify({
          name: 'midscene-cli-fixture',
          version: '1.0.0',
          bin: { 'midscene-test': './cli.cjs' },
        }),
      );
      writeFileSync(
        join(launcher, 'cli.cjs'),
        `#!/usr/bin/env node\nrequire(${JSON.stringify(join(packageRoot, 'bin/midscene-test'))});\n`,
      );
      chmodSync(join(launcher, 'cli.cjs'), 0o755);
      const manifestPath = join(root, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.devDependencies = {
        'midscene-cli-fixture': 'file:../cli-fixture',
      };
      writeFileSync(manifestPath, JSON.stringify(manifest));
      writeFileSync(
        join(root, 'midscene.config.ts'),
        `
        import { defineTestProject } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'dist/es/cli/index.mjs')).href)};
        export default defineTestProject({
          nodes: [{ name: 'install.inspect', description: 'Generated after installation.', execute() { throw new Error('Node execution is forbidden'); } }],
          setup: { name: 'offline', platform: 'web', setup() { throw new Error('Setup execution is forbidden'); } },
        });
      `,
      );
      const args =
        packageManager === 'npm'
          ? [
              'install',
              '--workspaces=false',
              '--offline',
              '--ignore-scripts=false',
              '--no-audit',
              '--no-fund',
            ]
          : [
              'install',
              '--ignore-workspace',
              '--offline',
              '--ignore-scripts=false',
            ];
      const install = () =>
        execFileAsync(packageManager, args, {
          cwd: root,
          env: { ...process.env, NODE_PATH: '' },
        });
      await install();
      const referencePath = join(root, 'midscene-nodes.md');
      expect(readFileSync(referencePath, 'utf8')).toContain(
        '## `install.inspect`',
      );
      expect(
        existsSync(
          join(
            root,
            packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml',
          ),
        ),
      ).toBe(true);
      writeFileSync(referencePath, 'outdated reference');
      await install();
      expect(readFileSync(referencePath, 'utf8')).toContain(
        '## `install.inspect`',
      );
      writeFileSync(
        join(root, 'midscene.config.ts'),
        "throw new Error('invalid postinstall config');",
      );
      await expect(install()).rejects.toThrow('invalid postinstall config');
      expect(existsSync(join(root, 'midscene_run'))).toBe(false);
    },
  );
  it.each(
    createPlatforms.flatMap((platform) =>
      createPackageManagers.map((packageManager) => ({
        platform,
        packageManager,
      })),
    ),
  )(
    'describes and type-checks the $platform template using $packageManager without runtime resources',
    async ({ platform, packageManager }) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPackageManager = async (packageManager, args, root) => {
        if (args[0] === 'install') {
          linkDependencies(root);
          if (platform === 'web') isolateWebDependency(root);
          return '';
        }
        const result = await execFileAsync(packageManager, args, {
          cwd: root,
          env: { ...process.env, NODE_PATH: '' },
        });
        return result.stdout;
      };
      await runCreateCommand(
        ['.', '--platform', platform, '--package-manager', packageManager],
        io(),
        runtime,
      );
      const markdown = readFileSync(join(cwd, 'midscene-nodes.md'), 'utf8');
      expect(markdown).toContain('## `aiAssert`');
      expect(markdown).toContain(
        platform === 'web'
          ? '## `gotoUrl`'
          : platform === 'computer'
            ? '## `aiAsk`'
            : '## `launch`',
      );
      const manifest = JSON.parse(
        readFileSync(join(cwd, 'package.json'), 'utf8'),
      );
      expect(manifest.devDependencies[`@midscene/${platform}`]).toBe(
        manifest.devDependencies['@midscene/test'],
      );
      expect(manifest.devDependencies['@playwright/test']).toBeUndefined();
      for (const other of createPlatforms.filter(
        (candidate) => candidate !== platform,
      )) {
        expect(manifest.devDependencies[`@midscene/${other}`]).toBeUndefined();
      }
      if (platform === 'computer') {
        expect(markdown).not.toContain('## `home`');
        expect(readFileSync(join(cwd, '.env.example'), 'utf8')).toContain(
          'COMPUTER_DISPLAY_ID=',
        );
      }
      if (platform === 'harmony') {
        expect(markdown).toContain('## `runHdcShell`');
        expect(readFileSync(join(cwd, '.env.example'), 'utf8')).toContain(
          'HARMONY_DEVICE_ID=',
        );
      }
      const collected = await execFileAsync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { collectWorkflowDocument } from '@midscene/test';
        import { loadTestProject } from '@midscene/test/config';
        import { resolve } from 'node:path';
        const project = await loadTestProject(resolve('midscene.config.ts'));
        const document = collectWorkflowDocument({ projectId: 'example', sourcePath: 'cases/example.yaml', absolutePath: resolve('cases/example.yaml') }, { resolveNode: name => project.resolveNode(name) });
        console.log(String(document.cases.length));
      `,
        ],
        { cwd },
      );
      expect(collected.stdout.trim()).toBe('1');
      expect(existsSync(join(cwd, 'midscene_run'))).toBe(false);
      await execFileAsync(process.execPath, [
        join(packageRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        cwd,
      ]);
      if (platform === 'web') {
        const files = await execFileAsync(process.execPath, [
          join(packageRoot, 'node_modules/typescript/bin/tsc'),
          '-p',
          cwd,
          '--listFilesOnly',
        ]);
        expect(files.stdout).toContain('/playwright/agent.d.ts');
        expect(files.stdout).not.toContain('/playwright/ai-fixture.d.ts');
        expect(files.stdout).not.toContain('/@playwright/test/');
      }
    },
    30000,
  );

  it.each(['module', 'commonjs'])(
    'loads the built Agent entry without Playwright Test and preserves the original entry (%s)',
    async (format) => {
      const cwd = temp();
      for (const [filename, content] of Object.entries(
        createProjectFiles('agent-entry', 'web', [], 'pnpm'),
      )) {
        const path = join(cwd, filename);
        mkdirSync(resolve(path, '..'), { recursive: true });
        writeFileSync(path, content);
      }
      linkDependencies(cwd);
      isolateWebDependency(cwd);
      const load = (specifier: string) =>
        format === 'module'
          ? `await import('${specifier}')`
          : `require('${specifier}')`;
      const prelude =
        format === 'module'
          ? `import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`
          : `const assert = require('node:assert/strict');`;
      const missingPeer =
        format === 'module'
          ? `await assert.rejects(import('@midscene/web/playwright'), { message: new RegExp("Cannot find package '@playwright/test'") });`
          : `assert.throws(() => require('@midscene/web/playwright'), { message: new RegExp("Cannot find module '@playwright/test'") });`;
      // pnpm's Vitest launcher adds workspace packages to NODE_PATH. Clear it
      // in these subprocesses so CommonJS cannot borrow optional peers.
      await execFileAsync(
        process.execPath,
        [
          '--input-type',
          format,
          '-e',
          `${prelude}
        const fromWeb = require('node:module').createRequire(require.resolve('@midscene/web/playwright/agent'));
        assert.throws(() => fromWeb.resolve('@playwright/test'), { code: 'MODULE_NOT_FOUND' });
        const agent = ${load('@midscene/web/playwright/agent')};
        assert.equal(typeof agent.PlaywrightAgent, 'function');
        assert.equal(agent.PlaywrightAgent, agent.PlaywrightPageAgent);
        assert.equal(typeof agent.PlaywrightBrowserAgent, 'function');
        assert.equal(typeof agent.PlaywrightAgent.getTestRunnerNodeDefinitions, 'function');
        assert.equal('PlaywrightAiFixture' in agent, false);
        ${missingPeer}
        `,
        ],
        { cwd, env: { ...process.env, NODE_PATH: '' } },
      );

      const peer = join(
        cwd,
        'node_modules/@midscene/web/node_modules/@playwright',
      );
      mkdirSync(peer);
      symlinkSync(
        resolve(
          packageRoot,
          '../web-integration/node_modules/@playwright/test',
        ),
        join(peer, 'test'),
        'dir',
      );
      await execFileAsync(
        process.execPath,
        [
          '--input-type',
          format,
          '-e',
          `${prelude}
        const agent = ${load('@midscene/web/playwright/agent')};
        const original = ${load('@midscene/web/playwright')};
        for (const name of ['PlaywrightAgent', 'PlaywrightPageAgent', 'PlaywrightBrowserAgent', 'PlaywrightWebPage', 'overrideAIConfig']) {
          assert.equal(original[name], agent[name]);
        }
        assert.equal(typeof original.PlaywrightAiFixture().aiAct, 'function');
        `,
        ],
        { cwd, env: { ...process.env, NODE_PATH: '' } },
      );
    },
  );

  it.each([
    ['web', 'esm'],
    ['web', 'cjs'],
    ['harmony', 'esm'],
    ['computer', 'esm'],
  ])(
    'includes an external package in the %s Node reference (%s)',
    async (platform, format) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPackageManager = async (_packageManager, args, root) => {
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
          if (options.platform !== ${JSON.stringify(platform)}) throw new Error('Unsupported platform');
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
        ['.', '--platform', platform, '--with', 'team-nodes@1.0.0'],
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
      runtime.runPackageManager = async (_packageManager, args, root) => {
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

  it.skipIf(process.platform === 'win32').each(createPackageManagers)(
    'runs the built create command through %s installation and description',
    async (packageManager) => {
      const cwd = temp();
      const root = join(cwd, 'project with spaces');
      linkDependencies(root);
      const bin = join(cwd, 'bin');
      mkdirSync(bin);
      // Substitute only package installation; description runs the actual built CLI.
      const launcher = join(bin, packageManager);
      writeFileSync(
        launcher,
        `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(cwd, 'commands.log'))}, JSON.stringify(args) + '\\n');
if (args[0] === 'install') process.exit(0);
const result = spawnSync(process.execPath, [${JSON.stringify(join(packageRoot, 'bin/midscene-test'))}, ...args.slice(args.indexOf('midscene-test') + 1)], { stdio: 'inherit' });
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
          '--package-manager',
          packageManager,
        ],
        {
          cwd,
          env: {
            ...process.env,
            npm_config_user_agent:
              packageManager === 'npm' ? 'pnpm/9.15.0' : 'npm/10.0.0',
            PATH: `${bin}:${process.env.PATH}`,
          },
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
      ).toEqual(
        packageManager === 'pnpm'
          ? [
              ['install', '--ignore-workspace'],
              ['exec', 'midscene-test', 'describe-nodes'],
            ]
          : [
              ['install', '--workspaces=false'],
              [
                'exec',
                '--no',
                '--workspaces=false',
                '--',
                'midscene-test',
                'describe-nodes',
              ],
            ],
      );
      const readme = readFileSync(join(root, 'README.md'), 'utf8');
      expect(readme).toContain(`${packageManager} test`);
      expect(readme).toContain(`${packageManager} run describe-nodes`);
      expect(existsSync(join(root, 'README.zh.md'))).toBe(false);
    },
  );
});
