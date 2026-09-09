import {
  existsSync,
  mkdtempSync,
  readFileSync,
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

const createConfig = (source: string): string => {
  const directory = mkdtempSync(join(tmpdir(), 'project-nodes-cli-'));
  directories.push(directory);
  writeFileSync(join(directory, 'midscene.config.ts'), source);
  return directory;
};

const scopedConfig = `
  const node = (name, description) => ({ name, description, execute() { throw new Error('must not execute'); } });
  export default {
    nodes: [node('shared', 'Shared global Node'), node('launch', 'Global launch')],
    projects: [
      { name: 'android', platform: 'android', nodes: [node('launch', 'Android launch')] },
      { name: 'ios', platform: 'ios', nodes: [node('launch', 'iOS launch'), node('ios.only', 'iOS only')] },
    ],
  };
`;

describe('Project-scoped Node references', () => {
  it('requires selection when effective Node sets differ', async () => {
    const root = createConfig(scopedConfig);
    const errors: string[] = [];
    expect(
      await runTestCli(['nodes', root], {
        log() {},
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('Use nodes --project <name>');
    expect(existsSync(join(root, 'midscene-node-reference.md'))).toBe(false);
  });

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
        join(root, 'midscene-node-reference.md'),
        'utf8',
      );
      expect(markdown).toContain(`Execution Project: ${name}`);
      expect(markdown).not.toContain('Shared global Node');
      expect(markdown).toContain(
        name === 'android' ? 'Android launch' : 'iOS launch',
      );
      expect(markdown).not.toContain(
        name === 'android' ? 'iOS launch' : 'Android launch',
      );
      expect(markdown).not.toContain('Global launch');
      expect(markdown.match(/^### `launch`$/gm)).toHaveLength(1);
    },
  );

  it('rejects an unknown Project without generating a reference', async () => {
    const root = createConfig(scopedConfig);
    const errors: string[] = [];
    expect(
      await runTestCli(['nodes', root, '--project', 'unknown'], {
        log() {},
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors).toContain('Unknown Midscene project: unknown');
    expect(existsSync(join(root, 'midscene-node-reference.md'))).toBe(false);
  });

  it('keeps the shared reference when all Projects inherit the same Nodes', async () => {
    const root = createConfig(`export default {
      nodes: [{ name: 'shared', description: 'Shared global Node', execute() {} }],
      projects: [{ name: 'android', platform: 'android' }, { name: 'ios', platform: 'ios' }],
    };`);
    expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(0);
    const markdown = readFileSync(
      join(root, 'midscene-node-reference.md'),
      'utf8',
    );
    expect(markdown.match(/^### `shared`$/gm)).toHaveLength(1);
    expect(markdown).toContain('Execution Project: android');
    expect(markdown).toContain('Execution Project: ios');
  });

  it('describes a single Project with only local Nodes without a selector', async () => {
    const root = createConfig(`export default {
      projects: [{ name: 'android', platform: 'android', nodes: [{ name: 'local', execute() {} }] }],
    };`);
    expect(await runTestCli(['nodes', root], { log() {}, error() {} })).toBe(0);
    expect(
      readFileSync(join(root, 'midscene-node-reference.md'), 'utf8'),
    ).toContain('### `local`');
  });
});
