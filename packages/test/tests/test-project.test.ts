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
      'Midscene config must default export an object with a nodes array.',
    );
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
