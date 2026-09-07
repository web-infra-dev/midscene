import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTestCli } from '../src/cli/test-command';

const directories: string[] = [];
const createProject = (nodes = '[]') => {
  const root = mkdtempSync(join(tmpdir(), 'describe-nodes-'));
  directories.push(root);
  writeFileSync(
    join(root, 'midscene.config.ts'),
    `export default { nodes: ${nodes} };`,
  );
  return root;
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('describe-nodes', () => {
  it('writes the full reference and prints every Node before its absolute path', async () => {
    const root = createProject(`[
      { name: 'beta', description: 'Runs beta.\\nIncludes a second line.', execute() {} },
      { name: 'alpha', description: 'Runs alpha.', execute() {} },
      { name: 'undocumented', execute() {} },
    ]`);
    const referencePath = join(root, 'midscene-nodes.md');
    writeFileSync(referencePath, 'outdated reference');
    const io = { log: vi.fn(), error: vi.fn(), write: vi.fn() };

    expect(await runTestCli(['describe-nodes', root], io)).toBe(0);

    expect(io.log.mock.calls.flat()).toEqual([
      'Registered Nodes (3):',
      '- alpha: Runs alpha.',
      '- beta: Runs beta.\nIncludes a second line.',
      '- undocumented: Description not declared.',
      `\nNode reference generated: ${referencePath}`,
    ]);
    const markdown = readFileSync(referencePath, 'utf8');
    for (const name of ['alpha', 'beta', 'undocumented']) {
      expect(markdown).toContain(`## \`${name}\``);
    }
    expect(markdown).toContain('### Input Schema');
    expect(markdown).not.toContain('Registered Nodes');
    expect(io.error).toHaveBeenCalledWith(
      'midscene-test describe-nodes: node "undocumented" has no description',
    );
  });

  it('uses the current directory by default and reports an empty registry', async () => {
    const root = createProject();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const io = { log: vi.fn(), error: vi.fn() };

    expect(await runTestCli(['describe-nodes'], io)).toBe(0);

    expect(io.log.mock.calls.flat()).toEqual([
      'Registered Nodes (0):',
      'No nodes are registered by the current Test Project.',
      `\nNode reference generated: ${join(root, 'midscene-nodes.md')}`,
    ]);
    expect(existsSync(join(root, 'midscene-nodes.md'))).toBe(true);
    const markdown = readFileSync(join(root, 'midscene-nodes.md'), 'utf8');
    expect(markdown).toContain('**Config file:** `midscene.config.ts`');
    expect(markdown).toContain('**Case files:**');
    expect(markdown).not.toContain('**Test directory:**');
    expect(markdown).not.toContain(root);
    expect(markdown).toContain('**Case files:** `**/*.{yaml,yml}`');
    expect(io.error).not.toHaveBeenCalled();
  });

  it('writes in the test directory when a custom config is specified', async () => {
    const root = createProject();
    mkdirSync(join(root, 'config'));
    writeFileSync(
      join(root, 'config', 'custom.ts'),
      `export default {
        nodes: [],
        projects: [
          { name: 'web', platform: 'web', files: {
            include: ['web/cases/**/*.yaml', 'shared/**/*.yml'],
            exclude: ['web/cases/**/*.draft.yaml'],
          } },
          { name: 'android', platform: 'android', files: {
            include: ['mobile/**/*.yaml'],
          } },
        ],
      };`,
    );
    const io = { log: vi.fn(), error: vi.fn() };

    expect(
      await runTestCli(
        ['describe-nodes', root, '--config', 'config/custom.ts'],
        io,
      ),
    ).toBe(0);

    expect(existsSync(join(root, 'midscene-nodes.md'))).toBe(true);
    expect(existsSync(join(root, 'config', 'midscene-nodes.md'))).toBe(false);
    const markdown = readFileSync(join(root, 'midscene-nodes.md'), 'utf8');
    expect(markdown).toContain('**Config file:** `config/custom.ts`');
    expect(markdown).toContain('**Case files:**');
    expect(markdown).not.toContain('**Test directory:**');
    expect(markdown).not.toContain(root);
    expect(markdown).toContain(
      '**Case files:** `web/cases/**/*.yaml`, `shared/**/*.yml` (Execution Project: web); excludes: `web/cases/**/*.draft.yaml`',
    );
    expect(markdown).toContain(
      '**Case files:** `mobile/**/*.yaml` (Execution Project: android)',
    );
  });

  it('reports a config outside the case directory using a relative path', async () => {
    const root = createProject();
    const caseRoot = join(root, 'test-cases');
    mkdirSync(caseRoot);
    const io = { log: vi.fn(), error: vi.fn() };

    expect(
      await runTestCli(
        ['describe-nodes', caseRoot, '--config', '../midscene.config.ts'],
        io,
      ),
    ).toBe(0);

    const markdown = readFileSync(join(caseRoot, 'midscene-nodes.md'), 'utf8');
    expect(markdown).toContain('**Config file:** `../midscene.config.ts`');
    expect(markdown).toContain('**Case files:**');
    expect(markdown).not.toContain(root);
  });

  it('states when no config file was loaded', async () => {
    const root = createProject();
    rmSync(join(root, 'midscene.config.ts'));
    const io = { log: vi.fn(), error: vi.fn() };

    expect(await runTestCli(['describe-nodes', root], io)).toBe(0);

    const markdown = readFileSync(join(root, 'midscene-nodes.md'), 'utf8');
    expect(markdown).toContain('**Config file:** No config file loaded.');
    expect(markdown).toContain('**Case files:**');
    expect(markdown).toContain('**Case files:** `**/*.{yaml,yml}`');
  });

  it('does not announce success when writing the file fails', async () => {
    const root = createProject();
    mkdirSync(join(root, 'midscene-nodes.md'));
    const io = { log: vi.fn(), error: vi.fn() };

    expect(await runTestCli(['describe-nodes', root], io)).toBe(1);

    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('midscene-nodes.md'),
    );
    expect(io.log).not.toHaveBeenCalled();
  });

  it('preserves the previous reference and does not announce success when loading fails', async () => {
    const root = createProject('[{ name: "invalid" }]');
    const referencePath = join(root, 'midscene-nodes.md');
    writeFileSync(referencePath, 'previous reference');
    const io = { log: vi.fn(), error: vi.fn() };

    expect(await runTestCli(['describe-nodes', root], io)).toBe(1);

    expect(readFileSync(referencePath, 'utf8')).toBe('previous reference');
    expect(io.error).toHaveBeenCalled();
    expect(io.log).not.toHaveBeenCalled();
  });
});
