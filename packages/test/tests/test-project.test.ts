import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTestProject } from '../src/cli/test-project';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  (globalThis as Record<string, unknown>).__testSetupMarker = undefined;
});

const createConfig = (source: string): { directory: string; path: string } => {
  const directory = mkdtempSync(join(tmpdir(), 'test-project-config-'));
  directories.push(directory);
  const path = join(directory, 'midscene.config.ts');
  writeFileSync(path, source);
  return { directory, path };
};

describe('test project config', () => {
  it('loads TypeScript syntax, root, and file selection', async () => {
    const { path } = createConfig(`
      interface Config {
        root: string;
        files: { include: string[]; exclude: string[] };
        nodes: unknown[];
      }
      const config: Config = {
        root: './e2e',
        files: {
          include: ['workflows/**/*.{yaml,yml}'],
          exclude: ['workflows/**/*.draft.yaml'],
        },
        nodes: [],
      };
      export default config;
    `);

    const project = await loadTestProject(path);

    expect(project.root).toBe('./e2e');
    expect(project.files).toEqual({
      include: ['workflows/**/*.{yaml,yml}'],
      exclude: ['workflows/**/*.draft.yaml'],
    });
  });

  it('loads adjacent TypeScript modules', async () => {
    const { directory, path } = createConfig(`
      import { nodes } from './nodes.ts';
      export default { nodes };
    `);
    writeFileSync(
      join(directory, 'nodes.ts'),
      `export const nodes = [{ name: 'local.node', execute() {} }];`,
    );

    const project = await loadTestProject(path);

    expect(project.resolveNode('local.node')?.name).toBe('local.node');
  });

  it('loads setupDocument without executing it', async () => {
    const marker = vi.fn();
    (globalThis as Record<string, unknown>).__testSetupMarker = marker;
    const { path } = createConfig(`
      export default {
        nodes: [],
        setupDocument() {
          globalThis.__testSetupMarker();
          return { ready: true };
        },
      };
    `);

    const project = await loadTestProject<{ ready: boolean }>(path);

    expect(marker).not.toHaveBeenCalled();
    expect(await project.setupDocument?.({} as never)).toEqual({ ready: true });
    expect(marker).toHaveBeenCalledOnce();
  });

  it('requires a default export', async () => {
    const { path } = createConfig('export const config = { nodes: [] };');

    await expect(loadTestProject(path)).rejects.toThrow(
      /must (?:have a default export|default export an object with a nodes array)/,
    );
  });

  it('creates a compatible implicit default project', async () => {
    const { path } = createConfig(`
      export default {
        files: { include: ['cases/**/*.yaml'] },
        nodes: [],
      };
    `);

    const loaded = await loadTestProject(path);

    expect(loaded.hasExplicitProjects).toBe(false);
    expect(loaded.projects).toEqual([
      {
        name: 'default',
        platform: 'web',
        files: { include: ['cases/**/*.yaml'] },
        tags: { include: [], exclude: [] },
        repeat: 1,
        retry: 0,
        variables: {},
      },
    ]);
  });

  it('resolves project inheritance, selectors, setup binding, runner, and output', async () => {
    const setupMarker = vi.fn();
    (globalThis as Record<string, unknown>).__testSetupMarker = setupMarker;
    const { path } = createConfig(`
      const androidSetup = {
        name: 'dora-android',
        platform: ['android'],
        setup() {
          globalThis.__testSetupMarker();
          return { connected: true };
        },
      };
      export default {
        files: {
          include: ['cases/**/*.{yaml,yml}'],
          exclude: ['cases/**/*.draft.yaml'],
        },
        projects: [
          {
            name: 'android-smoke',
            platform: 'android',
            setup: androidSetup,
            tags: { include: ['smoke'], exclude: ['ios-only'] },
            repeat: 2,
            retry: 1,
            variables: {
              appName: 'Aweme',
              launch: { reinstall: false },
            },
          },
          {
            name: 'ios-regression',
            platform: 'ios',
            files: { include: ['ios/**/*.yaml'], exclude: [] },
          },
        ],
        testRunner: { maxConcurrency: 1, bail: 2, testTimeout: 30000 },
        output: { summary: './out/summary.json', reportDir: './out/report' },
        nodes: [],
      };
    `);

    const loaded = await loadTestProject(path);

    expect(setupMarker).not.toHaveBeenCalled();
    expect(loaded.hasExplicitProjects).toBe(true);
    expect(loaded.projects[0]).toMatchObject({
      name: 'android-smoke',
      platform: 'android',
      files: {
        include: ['cases/**/*.{yaml,yml}'],
        exclude: ['cases/**/*.draft.yaml'],
      },
      tags: { include: ['smoke'], exclude: ['ios-only'] },
      repeat: 2,
      retry: 1,
      variables: {
        appName: 'Aweme',
        launch: { reinstall: false },
      },
      setup: { name: 'dora-android', platform: ['android'] },
    });
    expect(Object.isFrozen(loaded.projects[0].variables)).toBe(true);
    expect(Object.isFrozen(loaded.projects[0].variables.launch)).toBe(true);
    expect(Object.isFrozen(loaded.projects)).toBe(true);
    expect(Object.isFrozen(loaded.projects[0].files)).toBe(true);
    expect(Object.isFrozen(loaded.projects[0].files?.include)).toBe(true);
    expect(loaded.projects[1]).toMatchObject({
      files: { include: ['ios/**/*.yaml'], exclude: [] },
      tags: { include: [], exclude: [] },
      repeat: 1,
      retry: 0,
    });
    expect(loaded.testRunner).toEqual({
      maxConcurrency: 1,
      bail: 2,
      testTimeout: 30000,
    });
    expect(loaded.output).toEqual({
      summary: './out/summary.json',
      reportDir: './out/report',
    });
  });

  it.each([
    ['empty projects', 'projects: []', 'projects must be a non-empty array'],
    [
      'duplicate project names',
      `projects: [
        { name: 'same', platform: 'web' },
        { name: 'same', platform: 'ios' },
      ]`,
      'project name "same" must be unique',
    ],
    [
      'unknown platform',
      `projects: [{ name: 'bad', platform: 'desktop' }]`,
      'must be one of web, android, ios, computer',
    ],
    [
      'setup platform mismatch',
      `projects: [{
        name: 'ios',
        platform: 'ios',
        setup: { name: 'android', platform: 'android', setup() {} },
      }]`,
      'does not support project platform "ios"',
    ],
    [
      'empty project include',
      `projects: [{
        name: 'web', platform: 'web', files: { include: [] },
      }]`,
      'projects[0].files.include must be a non-empty array',
    ],
    [
      'invalid tags',
      `projects: [{
        name: 'web', platform: 'web', tags: { include: 'smoke' },
      }]`,
      'projects[0].tags.include must be an array',
    ],
    [
      'zero repeat',
      `projects: [{ name: 'web', platform: 'web', repeat: 0 }]`,
      'projects[0].repeat must be a positive integer',
    ],
    [
      'negative retry',
      `projects: [{ name: 'web', platform: 'web', retry: -1 }]`,
      'projects[0].retry must be a non-negative integer',
    ],
    [
      'non-JSON variable',
      `projects: [{
        name: 'web', platform: 'web', variables: { bad() {} },
      }]`,
      'projects[0].variables.bad must be JSON-compatible',
    ],
    [
      'non-plain variable',
      `projects: [{
        name: 'web', platform: 'web', variables: { bad: new Date() },
      }]`,
      'projects[0].variables.bad must be JSON-compatible',
    ],
    [
      'parallel runner',
      'testRunner: { maxConcurrency: 2 }',
      'testRunner.maxConcurrency currently only supports 1',
    ],
    [
      'negative bail',
      'testRunner: { bail: -1 }',
      'testRunner.bail must be a non-negative integer',
    ],
  ])('rejects invalid %s configuration', async (_name, field, message) => {
    const { path } = createConfig(`export default { ${field}, nodes: [] };`);
    await expect(loadTestProject(path)).rejects.toThrow(message);
  });

  it.each(['.js', '.cjs', '.mts', '.cts', '.tsx', '.json'])(
    'rejects the %s extension',
    async (extension) => {
      const { directory } = createConfig('export default { nodes: [] };');
      const path = join(directory, `config${extension}`);
      writeFileSync(path, 'export default { nodes: [] };');

      await expect(loadTestProject(path)).rejects.toThrow(
        `Unsupported Midscene config extension: ${extension}. Supported extension: .ts.`,
      );
    },
  );

  it('preserves the config path and cause for import failures', async () => {
    const { path } = createConfig(
      `import './missing'; export default { nodes: [] };`,
    );

    const error = await loadTestProject(path).catch((cause) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`Failed to load Midscene config "${path}"`);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('preserves the config path and cause for TypeScript syntax errors', async () => {
    const { path } = createConfig('export default { nodes: [ };');

    const error = await loadTestProject(path).catch((cause) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`Failed to load Midscene config "${path}"`);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('does not execute a config twice when it throws a runtime SyntaxError', async () => {
    const marker = vi.fn();
    (globalThis as Record<string, unknown>).__testSetupMarker = marker;
    const { path } = createConfig(`
      globalThis.__testSetupMarker();
      throw new SyntaxError('runtime syntax error');
    `);

    await expect(loadTestProject(path)).rejects.toThrow('runtime syntax error');
    expect(marker).toHaveBeenCalledOnce();
  });

  it('does not resolve tsconfig paths', async () => {
    const { directory, path } = createConfig(
      `import { nodes } from '#nodes'; export default { nodes };`,
    );
    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '#nodes': ['./nodes.ts'] } },
      }),
    );
    writeFileSync(join(directory, 'nodes.ts'), 'export const nodes = [];');

    await expect(loadTestProject(path)).rejects.toThrow(
      `Failed to load Midscene config "${path}"`,
    );
  });

  it('rejects invalid document lifecycle config', async () => {
    const { path } = createConfig(
      'export default { nodes: [], setupDocument: true };',
    );

    await expect(loadTestProject(path)).rejects.toThrow(
      'Midscene config setupDocument must be a function.',
    );

    const removedSetup = createConfig(
      'export default { nodes: [], setupWorkflow() {} };',
    );
    await expect(loadTestProject(removedSetup.path)).rejects.toThrow(
      'setupWorkflow is no longer supported',
    );
  });

  it.each([
    [
      'root',
      'export default { nodes: [], root: "" };',
      'root must be a non-empty string',
    ],
    [
      'files',
      'export default { nodes: [], files: [] };',
      'files must be an object',
    ],
    [
      'missing include',
      'export default { nodes: [], files: {} };',
      'files.include must be an array',
    ],
    [
      'empty include',
      'export default { nodes: [], files: { include: [] } };',
      'files.include must be a non-empty array',
    ],
    [
      'absolute pattern',
      'export default { nodes: [], files: { include: ["/outside/*.yaml"] } };',
      'must be relative to the project root',
    ],
    [
      'parent pattern',
      'export default { nodes: [], files: { include: ["../outside/*.yaml"] } };',
      'must not contain a ".." path segment',
    ],
    [
      'negated include',
      'export default { nodes: [], files: { include: ["!draft.yaml"] } };',
      'Use files.exclude instead',
    ],
    [
      'negated exclude',
      'export default { nodes: [], files: { include: ["*.yaml"], exclude: ["!keep.yaml"] } };',
      'files.exclude[0] must not be a negated pattern',
    ],
    [
      'non-POSIX separator',
      'export default { nodes: [], files: { include: ["flows\\\\*.yaml"] } };',
      'must use POSIX path separators',
    ],
    [
      'invalid exclude',
      'export default { nodes: [], files: { include: ["*.yaml"], exclude: true } };',
      'files.exclude must be an array',
    ],
  ])('rejects invalid %s config', async (_name, source, message) => {
    const { path } = createConfig(source);
    await expect(loadTestProject(path)).rejects.toThrow(message);
  });
});
