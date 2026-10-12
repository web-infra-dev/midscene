import { execFile } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { executablePath } from 'puppeteer';
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
// Fail if a built entry selects tsx's CommonJS API. Its async loader path is
// broken in tsx 4.23.15 on Node 22.19; exercise the real ESM API instead.
const rejectTsxCjsApi = `
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (specifier, ...args) {
    if (specifier === 'tsx/esm/api') {
      throw new Error('The config loader must use the tsx ESM entry');
    }
    return originalLoad.call(this, specifier, ...args);
  };
`;
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
// The separate reset check below uses an offline page in a real browser.
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
  it('resets existing and filtered Todos before each Web case without a model', async () => {
    const root = temp();
    for (const [filename, content] of Object.entries(
      createProjectFiles('web-reset', 'web', 'pnpm'),
    )) {
      const path = join(root, filename);
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, content);
    }
    linkDependencies(root);
    // This offline fixture makes persisted and filtered state observable. It
    // is test-only; generated projects continue to use the public React app.
    writeFileSync(
      join(root, 'fixture.html'),
      `<!doctype html>
      <input class="new-todo"><ul class="todo-list"></ul>
      <script>
        const items = JSON.parse(localStorage.getItem('fixtureTodos') || '[]');
        function render() {
          const list = document.querySelector('.todo-list');
          list.replaceChildren();
          for (const todo of items) {
            if (location.hash === '#/completed' && !todo.completed) continue;
            const item = document.createElement('li');
            if (todo.completed) item.className = 'completed';
            const label = document.createElement('label');
            label.textContent = todo.title;
            item.append(label);
            list.append(item);
          }
        }
        document.querySelector('.new-todo').addEventListener('keydown', event => {
          if (event.key !== 'Enter') return;
          items.push({ title: event.target.value, completed: false });
          localStorage.setItem('fixtureTodos', JSON.stringify(items));
          event.target.value = '';
          render();
        });
        addEventListener('hashchange', render);
        render();
      </script>`,
    );
    await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import { resolve } from 'node:path';
      import { chromium } from 'playwright';
      import { loadTestProject } from '@midscene/test/config';
      const browser = await chromium.launch({ headless: true, executablePath: ${JSON.stringify(executablePath())} });
      try {
        const page = await browser.newPage();
        const html = readFileSync('fixture.html', 'utf8');
        await page.route('https://todomvc.com/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto('https://todomvc.com/examples/react/dist/#/');
        await page.evaluate(() => {
          localStorage.setItem('fixtureTodos', JSON.stringify([
            { title: 'Old active task', completed: false },
            { title: 'Old completed task', completed: true },
          ]));
          location.hash = '#/completed';
        });
        await page.reload();
        assert.equal(await page.locator('.todo-list li').count(), 1);
        const project = await loadTestProject(resolve('midscene.config.ts'));
        const execute = (name, input = {}) => project.resolveNode(name).execute({
          input, context: { page }, signal: new AbortController().signal,
        });
        for (let round = 0; round < 2; round += 1) {
          const reset = await execute('todo.setup');
          assert.deepEqual(reset.data.items, []);
          assert.equal(page.url(), 'https://todomvc.com/examples/react/dist/#/');
          assert.equal(await page.locator('.todo-list li').count(), 0);
          assert.equal(await page.evaluate(() => localStorage.getItem('fixtureTodos')), null);
          const items = ['Fresh task ' + round, 'Another task ' + round];
          await execute('todo.seed', { items });
          await execute('todo.expectState', { items: items.map(title => ({ title, completed: false })) });
          await page.evaluate(() => { location.hash = '#/completed'; });
          await page.reload();
        }
      } finally {
        await browser.close();
      }
    `,
      ],
      { cwd: root, env: { ...process.env, NODE_PATH: '' } },
    );
  });

  it.each([
    ...createPlatforms
      .filter((platform) => platform !== 'web')
      .map((platform) => ({ platform, state: 'dirty' })),
    { platform: 'android', state: 'clean' },
    { platform: 'android', state: 'model-error' },
  ] as const)(
    'checks initial state and preserves cleanup for $platform ($state)',
    async ({ platform, state }) => {
      const root = temp();
      for (const [filename, content] of Object.entries(
        createProjectFiles('initial-state', platform, 'pnpm'),
      )) {
        const path = join(root, filename);
        mkdirSync(resolve(path, '..'), { recursive: true });
        writeFileSync(path, content);
      }
      linkDependencies(root);
      const casePath = join(root, 'cases/todo.yaml');
      writeFileSync(
        casePath,
        `${readFileSync(casePath, 'utf8')}\n  - name: Later case\n    steps:\n      - test.body: {}\n`,
      );
      writeFileSync(
        join(root, 'fixture.config.ts'),
        `
      import { appendFileSync } from 'node:fs';
      import base from './midscene.config';
      const log = value => appendFileSync('executed.log', value + '\\n');
      const agent = {
        async launch(url) {
          if (url !== 'https://todomvc.com/examples/react/dist/#/') throw new Error('Unexpected URL: ' + url);
          log('open');
        },
        async aiWaitFor() { log('ready'); },
        async aiAct(prompt) {
          log(prompt.startsWith('Open a browser') ? 'open' : 'body');
        },
        async aiAssert(prompt, message) {
          if (!prompt.includes('The list is unfiltered')) { log('body-assert'); return { pass: true }; }
          log('initial-state');
          if (${JSON.stringify(state)} === 'model-error') throw new Error('model backend unavailable');
          return ${JSON.stringify(state)} === 'dirty' ? { pass: false, message } : { pass: true };
        },
        async flushReport() { log('report'); },
        async destroy() { log('destroy'); },
      };
      export default {
        ...base,
        nodes: [...base.nodes, { name: 'test.body', execute() { log('later-body'); } }],
        projects: base.projects.map(project => ({
          ...project,
          setup: { name: 'fixture', setup({ onTeardown }) {
            onTeardown(() => agent.destroy());
            return { agent };
          } },
        })),
      };
    `,
      );
      let exitCode = 0;
      let result: { stdout: string; stderr: string };
      try {
        result = await execFileAsync(
          process.execPath,
          [
            join(packageRoot, 'bin/midscene-test'),
            '--config',
            'fixture.config.ts',
          ],
          { cwd: root, env: { ...process.env, NODE_PATH: '' } },
        );
      } catch (error) {
        const failure = error as Error & {
          code: number;
          stdout: string;
          stderr: string;
        };
        exitCode = failure.code;
        result = failure;
      }
      expect(exitCode, result.stderr).toBe(state === 'clean' ? 0 : 1);
      if (state !== 'clean') {
        expect(result.stdout).toContain(
          '0/2 cases passed, 1 failed, 1 not run',
        );
        expect(result.stderr).toContain(
          state === 'dirty'
            ? 'delete every task, including completed tasks'
            : 'model backend unavailable',
        );
      }
      if (state === 'model-error')
        expect(result.stderr).not.toContain('clear this website');
      const log = readFileSync(join(root, 'executed.log'), 'utf8')
        .trim()
        .split('\n');
      expect(log.slice(0, 3)).toEqual(['open', 'ready', 'initial-state']);
      expect(log).toContain('report');
      expect(log.at(-1)).toBe('destroy');
      if (state === 'clean') expect(log).toContain('later-body');
      else expect(log.some((line) => line.includes('body'))).toBe(false);
      expect(
        readdirSync(join(root, 'midscene_run/report')).some((name) =>
          name.endsWith('.html'),
        ),
      ).toBe(true);
    },
  );

  it('creates all starters from a real pnpm tarball with working ignore rules', async () => {
    const root = temp();
    await execFileAsync('pnpm', ['pack', '--pack-destination', root], {
      cwd: packageRoot,
    });
    const archives = readdirSync(root).filter((name) => name.endsWith('.tgz'));
    expect(archives).toHaveLength(1);
    await execFileAsync('tar', ['-xzf', join(root, archives[0]), '-C', root]);
    const packedRoot = join(root, 'package');
    expect(existsSync(resolve(packedRoot, '../../examples/catalog'))).toBe(
      false,
    );
    // Only dependencies are borrowed from the checkout. The CLI and every
    // template must come from the extracted publication artifact.
    symlinkSync(
      join(packageRoot, 'node_modules'),
      join(packedRoot, 'node_modules'),
      'junction',
    );
    for (const platform of createPlatforms) {
      const project = join(root, platform);
      expect(
        existsSync(
          join(packedRoot, 'dist/templates/test', platform, 'gitignore'),
        ),
      ).toBe(true);
      await execFileAsync(
        process.execPath,
        [
          join(packedRoot, 'bin/midscene-test'),
          'create',
          project,
          '--platform',
          platform,
          '--package-manager',
          'pnpm',
          '--skip-install',
        ],
        { cwd: root, env: { ...process.env, NODE_PATH: '' } },
      );
      expect(readFileSync(join(project, '.gitignore'), 'utf8')).toBe(
        'node_modules/\n.env\nmidscene_run/\n',
      );
      expect(existsSync(join(project, 'gitignore'))).toBe(false);
      expect(existsSync(join(project, '.env.example'))).toBe(true);
      expect(existsSync(join(project, 'package.json'))).toBe(true);
      await execFileAsync('git', ['init', '--quiet'], { cwd: project });
      const ignored = await execFileAsync(
        'git',
        [
          'check-ignore',
          '--no-index',
          '.env',
          'node_modules/dependency/index.js',
          'midscene_run/report/run.html',
        ],
        { cwd: project },
      );
      expect(ignored.stdout.trim().split('\n')).toEqual([
        '.env',
        'node_modules/dependency/index.js',
        'midscene_run/report/run.html',
      ]);
    }
  });

  it.each(
    [
      {
        format: 'ESM',
        entry: join(packageRoot, 'dist/es/cli/index.mjs'),
        loadEntry: (entry: string) =>
          `const { loadTestProject } = await import(${JSON.stringify(pathToFileURL(entry).href)});`,
      },
      {
        format: 'CommonJS',
        entry: join(packageRoot, 'dist/lib/cli/index.js'),
        loadEntry: (entry: string) =>
          `const { loadTestProject } = require(${JSON.stringify(entry)});`,
      },
    ].flatMap((entry) =>
      ['mjs', 'ts'].map((extension) => ({ ...entry, extension })),
    ),
  )(
    'loads a .$extension config from the built $format config entry using native ESM imports',
    async ({ entry, loadEntry, extension }) => {
      const cwd = temp();
      writeFileSync(join(cwd, 'package.json'), '{"type":"module"}');
      const configPath = join(cwd, `config.${extension}`);
      writeFileSync(
        configPath,
        `
          const configUrl${extension === 'ts' ? ': string' : ''} = import.meta.url;
          await Promise.resolve();
          export default {
            nodes: [],
            projects: [{ name: 'esm', variables: { configUrl } }],
          };
        `,
      );

      await execFileAsync(process.execPath, [
        '--input-type=commonjs',
        '-e',
        `
          ${rejectTsxCjsApi}
          (async () => {
            const assert = require('node:assert/strict');
            ${loadEntry(entry)}
            const project = await loadTestProject(${JSON.stringify(configPath)});
            const configUrl = new URL(project.projects[0].variables.configUrl);
            assert.equal(configUrl.protocol, 'file:');
            assert.equal(configUrl.pathname.endsWith('/config.${extension}'), true);
          })().catch((error) => {
            console.error(error);
            process.exitCode = 1;
          });
        `,
      ]);
    },
  );

  it('generates Node Specs through the built CLI using the tsx ESM entry', async () => {
    const cwd = temp();
    const guard = join(cwd, 'guard.cjs');
    writeFileSync(guard, rejectTsxCjsApi);
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `
        const name: string = 'inspect';
        export default {
          nodes: [{ name, description: 'Inspect without execution.', execute() { throw new Error('Node execution is forbidden'); } }],
        };
      `,
    );
    await execFileAsync(
      process.execPath,
      ['--require', guard, join(packageRoot, 'bin/midscene-test'), 'nodes'],
      { cwd, env: { ...process.env, NODE_PATH: '' } },
    );
    expect(readFileSync(join(cwd, 'midscene-node-spec.md'), 'utf8')).toContain(
      '## `inspect`',
    );
  });

  it.each(createPackageManagers)(
    'generates and refreshes the spec on a manual %s install after skipping installation',
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
      expect(existsSync(join(root, 'midscene-node-spec.md'))).toBe(false);

      // Install a local CLI launcher instead of registry dependencies. This
      // exercises real npm/pnpm install lifecycles with the generated scripts
      // and actual nodes command, without network or runtime resources.
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
          setup: { name: 'offline', setup() { throw new Error('Setup execution is forbidden'); } },
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
      const specPath = join(root, 'midscene-node-spec.md');
      expect(readFileSync(specPath, 'utf8')).toContain('## `install.inspect`');
      expect(
        existsSync(
          join(
            root,
            packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml',
          ),
        ),
      ).toBe(true);
      writeFileSync(specPath, 'outdated spec');
      await install();
      expect(readFileSync(specPath, 'utf8')).toContain('## `install.inspect`');
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
      const markdown = readFileSync(
        join(cwd, `midscene-node-spec.${platform}.md`),
        'utf8',
      );
      expect(markdown).toContain('## `aiAssert`');
      expect(markdown).toContain('## `todo.setup`');
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
        const document = collectWorkflowDocument({ projectId: 'example', sourcePath: 'cases/todo.yaml', absolutePath: resolve('cases/todo.yaml') }, { resolveNode: name => project.resolveNode(name) });
        console.log(String(document.cases.length));
      `,
        ],
        { cwd },
      );
      expect(collected.stdout.trim()).toBe(platform === 'web' ? '2' : '1');
      expect(existsSync(join(cwd, 'midscene_run'))).toBe(false);
      await execFileAsync(process.execPath, [
        join(packageRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        cwd,
      ]);
      if (platform === 'web') {
        for (const node of [
          'todo.setup',
          'todo.seed',
          'todo.expectState',
          'todo.captureState',
        ]) {
          expect(markdown).toContain(`## \`${node}\``);
        }
        expect(existsSync(join(cwd, 'public/todo.html'))).toBe(false);
        expect(readFileSync(join(cwd, 'nodes/todo.ts'), 'utf8')).toContain(
          'todomvc.com',
        );
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
        createProjectFiles('agent-entry', 'web', 'pnpm'),
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
      expect(result.stdout).toContain('Project ready!');
      expect(
        readFileSync(join(root, 'midscene-node-spec.web.md'), 'utf8'),
      ).toContain('## `gotoUrl`');
      expect(
        readFileSync(join(cwd, 'commands.log'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toEqual(
        packageManager === 'pnpm'
          ? [
              ['install', '--ignore-workspace'],
              ['exec', 'midscene-test', 'nodes'],
            ]
          : [
              ['install', '--workspaces=false'],
              [
                'exec',
                '--no',
                '--workspaces=false',
                '--',
                'midscene-test',
                'nodes',
              ],
            ],
      );
      const readme = readFileSync(join(root, 'README.md'), 'utf8');
      expect(readme).toContain(`${packageManager} test`);
      expect(readme).toContain(`${packageManager} run nodes`);
      expect(existsSync(join(root, 'README.zh.md'))).toBe(true);
    },
  );
});
