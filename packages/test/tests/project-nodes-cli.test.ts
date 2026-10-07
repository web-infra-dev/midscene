import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runTestCli } from '../src/cli/test-command';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const createConfig = (
  source: string,
  filename = 'midscene.config.ts',
): string => {
  const directory = mkdtempSync(join(tmpdir(), 'project-nodes-cli-'));
  directories.push(directory);
  writeFileSync(join(directory, filename), source);
  return directory;
};

const scopedConfig = `
  const node = (name, description) => ({ name, description, execute() { throw new Error('must not execute'); } });
  export default {
    nodes: [node('shared', 'Shared global Node'), node('launch', 'Global launch')],
    projects: [
      { name: 'android', nodes: [node('launch', 'Android launch')] },
      { name: 'ios', nodes: [node('launch', 'iOS launch'), node('ios.only', 'iOS only')] },
    ],
  };
`;

describe('Project-scoped Node Specs', () => {
  it('loads a JavaScript ESM config through the CLI --config option', async () => {
    const root = createConfig(
      `export default {
        nodes: [{ name: 'esm.node', description: 'Loaded from ESM', execute() {} }],
      };`,
      'config.mjs',
    );

    expect(
      await runTestCli(['nodes', root, '--config', 'config.mjs'], {
        log() {},
        error() {},
      }),
    ).toBe(0);
    expect(readFileSync(join(root, 'midscene-node-spec.md'), 'utf8')).toContain(
      '### `esm.node`',
    );
  });

  it('generates every Project by default even when effective Nodes differ', async () => {
    const root = createConfig(scopedConfig);
    expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(0);
    for (const name of ['android', 'ios']) {
      const markdown = readFileSync(
        join(root, `midscene-node-spec.${name}.md`),
        'utf8',
      );
      expect(markdown).toContain(`Execution Project: ${name}`);
      expect(markdown).toContain(
        name === 'android' ? 'Android launch' : 'iOS launch',
      );
      expect(markdown).not.toContain(
        name === 'android' ? 'iOS launch' : 'Android launch',
      );
    }
    expect(existsSync(join(root, 'midscene-node-spec.md'))).toBe(false);
  });

  it.each([
    ['android', 'android'],
    ['Android', 'android'],
    ['a/b', 'a?b'],
    ['é', 'e\u0301'],
  ])(
    'rejects conflicting Project names %s and %s before writing',
    async (first, second) => {
      const root = createConfig(
        `export default { projects: [{ name: ${JSON.stringify(first)} }, { name: ${JSON.stringify(second)} }] };`,
      );
      const errors: string[] = [];
      expect(
        await runTestCli(['nodes', root, '--project', first], {
          log() {},
          error: (message) => errors.push(message),
        }),
      ).toBe(1);
      expect(errors.join('\n')).toMatch(
        /must be unique|same Node Spec filename/,
      );
      expect(readdirSync(root)).toEqual(['midscene.config.ts']);
    },
  );

  it.each(['android', 'ios'])(
    'describes only the effective %s Nodes',
    async (name) => {
      const root = createConfig(scopedConfig);
      expect(
        await runTestCli(['nodes', root, '--project', name], {
          log() {},
          error() {},
        }),
      ).toBe(0);
      const markdown = readFileSync(
        join(root, `midscene-node-spec.${name}.md`),
        'utf8',
      );
      expect(markdown).toContain(`Execution Project: ${name}`);
      expect(markdown).toContain('Shared global Node');
      expect(markdown).toContain(
        name === 'android' ? 'Android launch' : 'iOS launch',
      );
      expect(markdown).not.toContain(
        name === 'android' ? 'iOS launch' : 'Android launch',
      );
      expect(markdown).not.toContain('Global launch');
      expect(markdown.match(/^### `launch`$/gm)).toHaveLength(1);
      const otherName = name === 'android' ? 'ios' : 'android';
      expect(existsSync(join(root, `midscene-node-spec.${otherName}.md`))).toBe(
        false,
      );
      expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(
        0,
      );
      expect(
        readFileSync(join(root, `midscene-node-spec.${name}.md`), 'utf8'),
      ).toBe(markdown);
    },
  );

  it('rejects an unknown Project without generating a spec', async () => {
    const root = createConfig(scopedConfig);
    const errors: string[] = [];
    expect(
      await runTestCli(['nodes', root, '--project', 'unknown'], {
        log() {},
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors).toContain('Unknown Midscene project: unknown');
    expect(readdirSync(root)).toEqual(['midscene.config.ts']);
  });

  it('generates separate specs even when Projects inherit identical Nodes', async () => {
    const root = createConfig(`export default {
      nodes: [{ name: 'shared', execute() {} }],
      projects: [{ name: 'android' }, { name: 'ios' }],
    };`);
    expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(0);
    for (const name of ['android', 'ios']) {
      const markdown = readFileSync(
        join(root, `midscene-node-spec.${name}.md`),
        'utf8',
      );
      expect(markdown).toContain(`Execution Project: ${name}`);
      expect(markdown).toContain('### `shared`');
    }
  });

  it('describes a single Project with only local Nodes without a selector', async () => {
    const root = createConfig(`export default {
      projects: [{ name: 'android', nodes: [{ name: 'local', execute() {} }] }],
    };`);
    expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(0);
    expect(
      readFileSync(join(root, 'midscene-node-spec.android.md'), 'utf8'),
    ).toContain('### `local`');
  });
});
